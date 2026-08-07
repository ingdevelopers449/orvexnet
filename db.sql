CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    id_telegram BIGINT NOT NULL UNIQUE,

    nombre TEXT,

    nombre_usuario TEXT,

    saldo NUMERIC(15, 2) NOT NULL DEFAULT 0.00,

    bloqueado BOOLEAN NOT NULL DEFAULT FALSE,

    activo BOOLEAN NOT NULL DEFAULT TRUE,

    fecha_registro TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT saldo_no_negativo
        CHECK (saldo >= 0)
);


CREATE TABLE IF NOT EXISTS administradores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    id_telegram BIGINT NOT NULL UNIQUE,

    nombre TEXT,

    activo BOOLEAN NOT NULL DEFAULT TRUE,

    fecha_registro TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS productos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    nombre TEXT NOT NULL,

    descripcion TEXT,

    precio NUMERIC(15, 2) NOT NULL,

    moneda TEXT NOT NULL DEFAULT 'USD',

    stock INTEGER NOT NULL DEFAULT 0,

    tipo_entrega TEXT NOT NULL DEFAULT 'manual',

    contenido TEXT,

    imagen_url TEXT,

    activo BOOLEAN NOT NULL DEFAULT TRUE,

    destacado BOOLEAN NOT NULL DEFAULT FALSE,

    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT precio_positivo
        CHECK (precio > 0),

    CONSTRAINT stock_no_negativo
        CHECK (stock >= 0),

    CONSTRAINT tipo_entrega_valido
        CHECK (
            tipo_entrega IN (
                'automatica',
                'manual'
            )
        )
);


CREATE TABLE IF NOT EXISTS movimientos_inventario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    id_producto UUID NOT NULL,

    cantidad INTEGER NOT NULL,

    tipo_movimiento TEXT NOT NULL,

    stock_anterior INTEGER NOT NULL,

    stock_nuevo INTEGER NOT NULL,

    descripcion TEXT,

    id_administrador BIGINT,

    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_movimiento_producto
        FOREIGN KEY (id_producto)
        REFERENCES productos(id)
        ON DELETE CASCADE,

    CONSTRAINT tipo_movimiento_inventario_valido
        CHECK (
            tipo_movimiento IN (
                'entrada',
                'salida',
                'ajuste',
                'devolucion'
            )
        )
);

CREATE TABLE IF NOT EXISTS compras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    id_usuario UUID NOT NULL,

    id_producto UUID NOT NULL,

    precio_pagado NUMERIC(15, 2) NOT NULL,

    moneda TEXT NOT NULL DEFAULT 'USD',

    cantidad INTEGER NOT NULL DEFAULT 1,

    estado TEXT NOT NULL DEFAULT 'pendiente',

    contenido_entregado TEXT,

    fecha_compra TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    fecha_entrega TIMESTAMPTZ,

    CONSTRAINT fk_compra_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuarios(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_compra_producto
        FOREIGN KEY (id_producto)
        REFERENCES productos(id)
        ON DELETE RESTRICT,

    CONSTRAINT precio_pagado_positivo
        CHECK (precio_pagado >= 0),

    CONSTRAINT cantidad_compra_positiva
        CHECK (cantidad > 0),

    CONSTRAINT estado_compra_valido
        CHECK (
            estado IN (
                'pendiente',
                'pagada',
                'entregada',
                'cancelada',
                'reembolsada'
            )
        )
);

CREATE TABLE IF NOT EXISTS recargas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    id_usuario UUID NOT NULL,

    monto NUMERIC(15, 2) NOT NULL,

    moneda TEXT NOT NULL DEFAULT 'USDT',

    metodo_pago TEXT NOT NULL DEFAULT 'binance_pay',

    id_transaccion TEXT UNIQUE,

    numero_orden_comerciante TEXT UNIQUE,

    estado TEXT NOT NULL DEFAULT 'pendiente',

    comprobante_url TEXT,

    fecha_solicitud TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    fecha_verificacion TIMESTAMPTZ,

    id_administrador_verificador BIGINT,

    observacion TEXT,

    CONSTRAINT fk_recarga_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuarios(id)
        ON DELETE RESTRICT,

    CONSTRAINT monto_recarga_positivo
        CHECK (monto > 0),

    CONSTRAINT estado_recarga_valido
        CHECK (
            estado IN (
                'pendiente',
                'verificada',
                'aprobada',
                'rechazada',
                'cancelada'
            )
        )
);


CREATE TABLE IF NOT EXISTS movimientos_saldo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    id_usuario UUID NOT NULL,

    tipo_movimiento TEXT NOT NULL,

    monto NUMERIC(15, 2) NOT NULL,

    saldo_anterior NUMERIC(15, 2) NOT NULL,

    saldo_nuevo NUMERIC(15, 2) NOT NULL,

    descripcion TEXT,

    id_compra UUID,

    id_recarga UUID,

    id_administrador BIGINT,

    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_movimiento_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuarios(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_movimiento_compra
        FOREIGN KEY (id_compra)
        REFERENCES compras(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_movimiento_recarga
        FOREIGN KEY (id_recarga)
        REFERENCES recargas(id)
        ON DELETE SET NULL,

    CONSTRAINT tipo_movimiento_saldo_valido
        CHECK (
            tipo_movimiento IN (
                'recarga',
                'compra',
                'devolucion',
                'ajuste_positivo',
                'ajuste_negativo'
            )
        ),

    CONSTRAINT saldo_anterior_no_negativo
        CHECK (saldo_anterior >= 0),

    CONSTRAINT saldo_nuevo_no_negativo
        CHECK (saldo_nuevo >= 0)
);

CREATE TABLE IF NOT EXISTS notificaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    id_producto UUID,

    titulo TEXT NOT NULL,

    mensaje TEXT NOT NULL,

    tipo_notificacion TEXT NOT NULL,

    enviar_a_todos BOOLEAN NOT NULL DEFAULT TRUE,

    cantidad_destinatarios INTEGER NOT NULL DEFAULT 0,

    cantidad_enviados INTEGER NOT NULL DEFAULT 0,

    cantidad_fallidos INTEGER NOT NULL DEFAULT 0,

    estado TEXT NOT NULL DEFAULT 'borrador',

    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    fecha_envio TIMESTAMPTZ,

    id_administrador BIGINT,

    CONSTRAINT fk_notificacion_producto
        FOREIGN KEY (id_producto)
        REFERENCES productos(id)
        ON DELETE SET NULL,

    CONSTRAINT tipo_notificacion_valida
        CHECK (
            tipo_notificacion IN (
                'nuevo_producto',
                'nuevo_stock',
                'promocion',
                'informacion'
            )
        ),

    CONSTRAINT estado_notificacion_valido
        CHECK (
            estado IN (
                'borrador',
                'enviando',
                'enviada',
                'cancelada',
                'con_errores'
            )
        )
);


CREATE TABLE IF NOT EXISTS envios_notificaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    id_notificacion UUID NOT NULL,

    id_usuario UUID NOT NULL,

    estado TEXT NOT NULL DEFAULT 'pendiente',

    error TEXT,

    fecha_envio TIMESTAMPTZ,

    CONSTRAINT fk_envio_notificacion
        FOREIGN KEY (id_notificacion)
        REFERENCES notificaciones(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_envio_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    CONSTRAINT envio_unico
        UNIQUE (id_notificacion, id_usuario),

    CONSTRAINT estado_envio_valido
        CHECK (
            estado IN (
                'pendiente',
                'enviado',
                'fallido'
            )
        )
);

CREATE TABLE IF NOT EXISTS configuracion_bot (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    clave TEXT NOT NULL UNIQUE,

    valor TEXT,

    descripcion TEXT,

    fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS indice_usuarios_id_telegram
ON usuarios(id_telegram);

CREATE INDEX IF NOT EXISTS indice_productos_activos
ON productos(activo);

CREATE INDEX IF NOT EXISTS indice_compras_usuario
ON compras(id_usuario);

CREATE INDEX IF NOT EXISTS indice_compras_estado
ON compras(estado);

CREATE INDEX IF NOT EXISTS indice_recargas_usuario
ON recargas(id_usuario);

CREATE INDEX IF NOT EXISTS indice_recargas_estado
ON recargas(estado);

CREATE INDEX IF NOT EXISTS indice_recargas_transaccion
ON recargas(id_transaccion);

CREATE INDEX IF NOT EXISTS indice_movimientos_usuario
ON movimientos_saldo(id_usuario);

CREATE INDEX IF NOT EXISTS indice_movimientos_fecha
ON movimientos_saldo(fecha DESC);

CREATE INDEX IF NOT EXISTS indice_envios_notificacion
ON envios_notificaciones(id_notificacion);

CREATE INDEX IF NOT EXISTS indice_envios_usuario
ON envios_notificaciones(id_usuario);


CREATE OR REPLACE FUNCTION actualizar_fecha_modificacion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.fecha_actualizacion = NOW();
    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trigger_actualizar_usuario
ON usuarios;

CREATE TRIGGER trigger_actualizar_usuario
BEFORE UPDATE
ON usuarios
FOR EACH ROW
EXECUTE FUNCTION actualizar_fecha_modificacion();


DROP TRIGGER IF EXISTS trigger_actualizar_producto
ON productos;

CREATE TRIGGER trigger_actualizar_producto
BEFORE UPDATE
ON productos
FOR EACH ROW
EXECUTE FUNCTION actualizar_fecha_modificacion();



INSERT INTO configuracion_bot (
    clave,
    valor,
    descripcion
)
VALUES
(
    'nombre_bot',
    'Mi Tienda Digital',
    'Nombre visible del bot'
),
(
    'moneda_principal',
    'USD',
    'Moneda utilizada para los productos'
),
(
    'soporte',
    '@soporte',
    'Usuario de Telegram para soporte'
)
ON CONFLICT (clave)
DO NOTHING;


ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

ALTER TABLE administradores ENABLE ROW LEVEL SECURITY;

ALTER TABLE productos ENABLE ROW LEVEL SECURITY;

ALTER TABLE movimientos_inventario ENABLE ROW LEVEL SECURITY;

ALTER TABLE compras ENABLE ROW LEVEL SECURITY;

ALTER TABLE recargas ENABLE ROW LEVEL SECURITY;

ALTER TABLE movimientos_saldo ENABLE ROW LEVEL SECURITY;

ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

ALTER TABLE envios_notificaciones ENABLE ROW LEVEL SECURITY;

ALTER TABLE configuracion_bot ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- TABLA: INVENTARIO DINÁMICO (Cuentas individuales)
-- ==========================================
CREATE TABLE IF NOT EXISTS inventario_cuentas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_producto UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    contenido TEXT NOT NULL,
    vendido BOOLEAN NOT NULL DEFAULT FALSE,
    id_comprador UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    fecha_agregado TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_vendido TIMESTAMPTZ
);

ALTER TABLE inventario_cuentas ENABLE ROW LEVEL SECURITY;
