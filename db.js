/* Manos a la Obra · capa Supabase. Se carga DESPUÉS del script de la app. */
(function () {
  var C = window.MALO_CONFIG || {};
  if (!window.supabase || !C.SUPABASE_URL || C.SUPABASE_URL.indexOf("TU-PROYECTO") > -1) {
    console.warn("Supabase sin configurar: la app sigue en modo demo."); return;
  }
  var sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);

  function toBlob(u) {
    var p = u.split(","), b = atob(p[1]), a = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
    return new Blob([a], { type: "image/jpeg" });
  }
  async function subir(path, dataUrl) {
    var r = await sb.storage.from("fotos").upload(path, toBlob(dataUrl), { contentType: "image/jpeg" });
    if (r.error) throw r.error;
    return sb.storage.from("fotos").getPublicUrl(path).data.publicUrl;
  }

  /* Lobby: solo trabajadores activos con suscripción vigente (vista trabajadores_publicos) */
  async function cargar() {
    var r = await sb.from("trabajadores_publicos").select("*").order("creado_en", { ascending: false });
    if (r.error) { console.error(r.error); return; }
    WORKERS.length = 0;
    r.data.forEach(function (x, i) {
      WORKERS.push({ id: x.id, cat: x.categoria, nombre: x.nombre, ciudad: x.ciudad, depto: x.ciudad,
        anios: x.anios || 0, rating: 0, resenas: 0, color: COLORS[i % COLORS.length],
        tel: x.telefono, wa: x.whatsapp || x.telefono, verificado: true,
        tags: x.especialidades || [], sobre: x.sobre, trabajos: x.especialidades || [],
        foto: x.foto_url, fotos: x.fotos || [] });
    });
  }

  /* Registro: sube fotos a Storage, inserta el perfil (pendiente) y, si PAGO_SIMULADO, lo activa */
  window.activar = async function () {
    var b = document.querySelector("#app button[onclick='activar()']");
    if (b) { b.disabled = true; b.textContent = "Procesando…"; }
    try {
      var id = crypto.randomUUID(), fotos = [];
      var foto = D.foto ? await subir(id + "/perfil.jpg", D.foto) : null;
      for (var i = 0; i < D.fotos.length; i++) fotos.push(await subir(id + "/trabajo-" + (i + 1) + ".jpg", D.fotos[i]));
      var ins = await sb.from("trabajadores").insert({ id: id, categoria: D.cat, nombre: D.nombre,
        telefono: D.tel, whatsapp: D.wa, ciudad: D.ciudad, anios: D.anios, especialidades: D.tags,
        sobre: D.sobre, foto_url: foto, fotos: fotos });
      if (ins.error) throw ins.error;
      var activo = false;
      if (C.PAGO_SIMULADO) {
        var p = await sb.rpc("activar_simulado", { p_id: id });
        if (p.error) throw p.error;
        activo = true;
      }
      var h = new Date();
      S.me = { id: id, cat: D.cat, nombre: D.nombre, ciudad: D.ciudad, depto: D.ciudad, anios: D.anios,
        rating: 0, resenas: 0, color: D.color, tel: D.tel, wa: D.wa, tags: D.tags, sobre: D.sobre,
        trabajos: D.tags, foto: D.foto, fotos: D.fotos.slice(),
        sub: { estado: activo ? "activa" : "pendiente", inicio: h, vence: mas30(h) } };
      D = { foto: null, fotos: [] };
      await cargar(); go("panel");
    } catch (e) {
      console.error(e); alert("No se pudo registrar: " + (e.message || e));
      if (b) { b.disabled = false; b.textContent = "Simular pago y activar perfil"; }
    }
  };

  /* El panel del trabajador aún no tiene login: edición/cancelación llegará con Supabase Auth */
  var aviso = function () { msg("Disponible con el login de trabajadores (siguiente paso)."); };
  window.guardar = window.cancelar = window.reactivar = aviso;

  /* ---------- Panel de administración (#admin) ---------- */
  var EST = { pendiente: "Pendiente", activo: "Activo", suspendido: "Suspendido" };
  async function viewAdmin() {
    var ses = (await sb.auth.getSession()).data.session;
    if (!ses) {
      app.innerHTML = '<h2>Acceso administrador</h2><div class="prof"><div class="form">' +
        '<div class="field"><label>Correo</label><input id="a_e" type="email" autocomplete="username"></div>' +
        '<div class="field"><label>Contraseña</label><input id="a_p" type="password" autocomplete="current-password"></div>' +
        '<div id="err" role="alert"></div><button class="btn" onclick="adminLogin()">Entrar</button></div></div>';
      return;
    }
    var ok = await sb.rpc("is_admin");
    if (!ok.data) {
      app.innerHTML = '<div class="empty">Esta cuenta no es administradora.<br><br><button class="btn ghost" onclick="adminSalir()">Cerrar sesión</button></div>';
      return;
    }
    var r = await sb.from("trabajadores").select("id,nombre,telefono,ciudad,categoria,estado,creado_en").order("creado_en", { ascending: false });
    if (r.error) { app.innerHTML = '<div class="empty">' + esc(r.error.message) + '</div>'; return; }
    var n = function (e) { return r.data.filter(function (x) { return x.estado === e; }).length; };
    var h = '<div class="top" style="justify-content:space-between"><h2 style="margin:0">Panel de administración</h2><button class="btn ghost" onclick="adminSalir()">Salir</button></div>' +
      '<div class="grid" style="margin:14px 0">' +
      '<div class="step"><i>$' + (n("activo") * 9.99).toFixed(2) + '</i><br><small>Ingresos mensuales estimados</small></div>' +
      '<div class="step"><i>' + n("activo") + '</i><br><small>Activos</small></div>' +
      '<div class="step"><i>' + n("pendiente") + '</i><br><small>Pendientes</small></div>' +
      '<div class="step"><i>' + n("suspendido") + '</i><br><small>Suspendidos</small></div></div>' +
      '<h2>Trabajadores registrados</h2><div class="grid workers">';
    r.data.forEach(function (x) {
      var c = catBy(x.categoria), cls = x.estado === "activo" ? "badge" : x.estado === "suspendido" ? "badge off" : "tag";
      h += '<article class="wcard"><div><div class="name">' + esc(x.nombre) + '</div><div class="loc">' + (c ? c[1] + " " + esc(c[2]) : esc(x.categoria)) +
        ' · ' + esc(x.ciudad) + '<br>📞 ' + esc(x.telefono) + '</div></div><div><span class="' + cls + '">' + EST[x.estado] + '</span></div>';
      if (x.estado !== "activo")
        h += '<select id="m_' + x.id + '" style="padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--text)">' +
          '<option>Tigo Money</option><option>Chivo Wallet</option><option>Transferencia bancaria</option><option>Efectivo</option></select>' +
          '<button class="btn wa" onclick="adminActivar(\'' + x.id + '\')">Activar manualmente</button>';
      if (x.estado !== "suspendido") h += '<button class="btn ghost" onclick="adminSuspender(\'' + x.id + '\')">Suspender</button>';
      h += '</article>';
    });
    app.innerHTML = h + '</div>';
  }
  window.adminLogin = async function () {
    var r = await sb.auth.signInWithPassword({ email: document.getElementById("a_e").value.trim(), password: document.getElementById("a_p").value });
    if (r.error) { msg(r.error.message); return; } viewAdmin();
  };
  window.adminSalir = async function () { await sb.auth.signOut(); viewAdmin(); };
  window.adminActivar = async function (id) {
    var r = await sb.rpc("admin_activar_manual", { p_id: id, p_metodo: document.getElementById("m_" + id).value });
    if (r.error) alert(r.error.message); else { await cargar(); viewAdmin(); }
  };
  window.adminSuspender = async function (id) {
    var r = await sb.rpc("admin_set_estado", { p_id: id, p_estado: "suspendido" });
    if (r.error) alert(r.error.message); else { await cargar(); viewAdmin(); }
  };

  /* La ruta #admin se añade al enrutador de la app */
  var r0 = window.render;
  window.render = function (t) { if (t === "admin") { viewAdmin(); return; } r0(t); };

  cargar().then(function () { render(location.hash.slice(1)); });
})();
