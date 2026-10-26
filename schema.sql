-- Manos a la Obra · esquema Supabase (pegar completo en SQL Editor y ejecutar)

create table categorias(slug text primary key, nombre text not null, icono text);
insert into categorias values
('albanileria','Albañilería y Finos','🧱'),('auxiliares-construccion','Auxiliares de Construcción','👷'),
('fontaneria','Fontanería y Plomería','🔧'),('electricidad','Electricidad Residencial e Industrial','⚡'),
('pintura','Pintura y Acabados','🎨'),('carpinteria','Carpintería y Ebanistería','🪚'),
('tablaroca','Tablaroca / Gypsum','🏗️'),('soldadura','Soldadura y Herrería','🔥'),
('mecanica-automotriz','Mecánica Automotriz','🚗'),('mecanica-industrial','Mecánica Industrial','⚙️'),
('enderezado','Enderezado y Pintura','🛠️'),('motoristas','Motoristas, Fletes y Mudanzas','🏍️'),
('jardineria','Jardinería y Poda','🌿'),('aire-acondicionado','Aire Acondicionado y Refrigeración','❄️'),
('electrodomesticos','Reparación de Electrodomésticos','🔌'),('limpieza','Limpieza de Casas y Oficinas','🧹'),
('celulares-pc','Reparación de Celulares y Computadoras','📱'),('camaras-alarmas','Cámaras de Seguridad y Alarmas','📹'),
('fumigacion','Fumigación y Plagas','🐜'),('otros','Otros Oficios','➕');

create table trabajadores(
  id uuid primary key default gen_random_uuid(),
  categoria text not null references categorias(slug),
  nombre text not null check (char_length(nombre) between 3 and 80),
  telefono text not null check (telefono ~ '^[0-9]{8,15}$'),
  whatsapp text check (whatsapp ~ '^[0-9]{8,15}$'),
  ciudad text not null,
  anios int default 0 check (anios between 0 and 60),
  especialidades text[] default '{}',
  sobre text not null check (char_length(sobre) >= 30),
  foto_url text,
  fotos text[] default '{}' check (cardinality(fotos) between 3 and 6),
  estado text not null default 'pendiente' check (estado in ('pendiente','activo','suspendido')),
  creado_en timestamptz default now()
);
create index on trabajadores(categoria, ciudad);

create table suscripciones(
  id bigint generated always as identity primary key,
  trabajador_id uuid not null references trabajadores(id) on delete cascade,
  estado text not null default 'activa' check (estado in ('activa','vencida','cancelada')),
  monto numeric(6,2) not null default 9.99, moneda text default 'USD',
  metodo text,                       -- simulado, Tigo Money, Chivo Wallet, Transferencia, Stripe...
  inicio timestamptz default now(),
  vence_en timestamptz not null
);

create table admins(user_id uuid primary key references auth.users(id));
create table config(clave text primary key, valor text);
insert into config values('pago_simulado','true');   -- poner 'false' antes de lanzar

-- Seguridad
create function is_admin() returns boolean language sql security definer stable set search_path=public
as $$ select exists(select 1 from admins where user_id = auth.uid()) $$;

alter table categorias enable row level security;
alter table trabajadores enable row level security;
alter table suscripciones enable row level security;
alter table admins enable row level security;
alter table config enable row level security;

create policy cat_lectura on categorias for select using (true);
create policy trab_registro on trabajadores for insert to anon, authenticated with check (estado = 'pendiente');
create policy trab_admin on trabajadores for select to authenticated using (is_admin());
create policy sus_admin on suscripciones for select to authenticated using (is_admin());

-- Vista pública: solo activos con suscripción vigente
create view trabajadores_publicos as
select t.id, t.categoria, t.nombre, t.telefono, t.whatsapp, t.ciudad, t.anios,
       t.especialidades, t.sobre, t.foto_url, t.fotos, t.creado_en
from trabajadores t
where t.estado = 'activo'
  and exists (select 1 from suscripciones s
              where s.trabajador_id = t.id and s.estado = 'activa' and s.vence_en > now());
grant select on trabajadores_publicos to anon, authenticated;

-- Pago simulado (solo si config.pago_simulado = 'true' y el perfil está pendiente)
create function activar_simulado(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if coalesce((select valor from config where clave='pago_simulado'),'false') <> 'true' then
    raise exception 'Pago simulado desactivado'; end if;
  update trabajadores set estado='activo' where id=p_id and estado='pendiente';
  if not found then raise exception 'Perfil no disponible para activar'; end if;
  insert into suscripciones(trabajador_id, metodo, vence_en) values (p_id,'simulado', now() + interval '30 days');
end $$;

-- Acciones del administrador
create function admin_activar_manual(p_id uuid, p_metodo text) returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_admin() then raise exception 'No autorizado'; end if;
  update trabajadores set estado='activo' where id=p_id;
  insert into suscripciones(trabajador_id, metodo, vence_en) values (p_id, p_metodo, now() + interval '30 days');
end $$;

create function admin_set_estado(p_id uuid, p_estado text) returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_admin() then raise exception 'No autorizado'; end if;
  if p_estado not in ('pendiente','suspendido') then raise exception 'Estado inválido'; end if;
  update trabajadores set estado=p_estado where id=p_id;
end $$;
revoke execute on function admin_activar_manual(uuid,text), admin_set_estado(uuid,text) from public, anon;

-- Storage: bucket público de fotos (máx. 2 MB, solo imágenes)
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('fotos','fotos',true,2097152,array['image/jpeg','image/png','image/webp']) on conflict do nothing;
create policy fotos_lectura on storage.objects for select using (bucket_id='fotos');
create policy fotos_subida on storage.objects for insert to anon, authenticated with check (bucket_id='fotos');
