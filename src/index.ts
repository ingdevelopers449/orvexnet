import { Telegraf, Markup, Context, Scenes } from 'telegraf';
import { config } from './config/env';
import { supabase } from './config/supabase';
import LocalSession from 'telegraf-session-local';
import { addProductScene } from './scenes/addProduct';
import { addStockScene } from './scenes/addStock';
import { rechargeScene } from './scenes/recharge';
import { NotificationService } from './services/notifications';

if (!config.telegram.botToken) {
  throw new Error('Bot token is not provided');
}

const bot = new Telegraf(config.telegram.botToken);

// Configuración de Sesiones y Escenas
const localSession = new LocalSession({ database: 'session_db.json' });
bot.use(localSession.middleware());

const stage = new Scenes.Stage<any>([addProductScene, addStockScene, rechargeScene]);
bot.use(stage.middleware());

const notificationService = new NotificationService(bot);

// Middleware para verificar si el usuario existe en DB y crearlo si no
bot.use(async (ctx, next) => {
  if (ctx.from) {
    // Por rendimiento, idealmente deberíamos cachear esto, pero por ahora consultamos DB
    const { data: user, error } = await supabase
      .from('usuarios')
      .select('id, bloqueado')
      .eq('id_telegram', ctx.from.id)
      .single();

    if (error && error.code === 'PGRST116') {
      // No existe, crearlo
      await supabase.from('usuarios').insert([
        {
          id_telegram: ctx.from.id,
          nombre: ctx.from.first_name || '',
          nombre_usuario: ctx.from.username || null,
        }
      ]);
    } else if (user && user.bloqueado) {
      // Si está bloqueado, no lo procesamos
      return;
    }
  }
  return next();
});

// Middleware de administrador
const adminMiddleware = async (ctx: Context, next: () => Promise<void>) => {
  if (!ctx.from) return;
  const { data: admin } = await supabase
    .from('administradores')
    .select('id')
    .eq('id_telegram', ctx.from.id)
    .eq('activo', true)
    .single();

  if (admin) {
    return next();
  }
  // No hacemos nada si no es admin (según instrucciones)
};

// Comando /admin
bot.command('admin', adminMiddleware, async (ctx) => {
  await ctx.reply(
    '⚙️ Panel de administración principal\n\nSeleccione una opción:',
    Markup.inlineKeyboard([
      [Markup.button.callback('➕ Agregar producto', 'admin_add_product'), Markup.button.callback('📦 Agregar nuevo stock', 'admin_add_stock')],
      [Markup.button.callback('✏️ Editar producto', 'admin_edit_product'), Markup.button.callback('💰 Cambiar precio', 'admin_change_price')],
      [Markup.button.callback('📝 Cambiar descripción', 'admin_change_desc')],
      [Markup.button.callback('🟢 Activar producto', 'admin_activate_prod'), Markup.button.callback('🔴 Desactivar producto', 'admin_deactivate_prod')],
      [Markup.button.callback('🗑️ Eliminar producto', 'admin_delete_prod'), Markup.button.callback('📊 Ver inventario', 'admin_view_inventory')],
      [Markup.button.callback('📢 Enviar anuncio', 'admin_send_announcement'), Markup.button.callback('👥 Ver usuarios', 'admin_view_users')],
      [Markup.button.callback('💳 Revisar recargas', 'admin_review_recharges'), Markup.button.callback('💰 Gestionar saldos', 'admin_manage_balances')],
      [Markup.button.callback('🧾 Ver compras', 'admin_view_purchases'), Markup.button.callback('📈 Ver estadísticas', 'admin_view_stats')],
      [Markup.button.callback('🚫 Bloquear usuario', 'admin_block_user')],
      [Markup.button.callback('🔙 Volver al inicio', 'admin_back')]
    ])
  );
});

// Manejadores temporales de callback para probar el panel
bot.action('admin_back', adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('Panel cerrado.');
});

bot.action('admin_add_product', adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();
  // @ts-ignore
  await ctx.scene.enter('ADD_PRODUCT_SCENE');
});

bot.action('admin_add_stock', adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery('Cargando productos...');
  const { data: products } = await supabase.from('productos').select('id, nombre').eq('activo', true);
  
  if (!products || products.length === 0) {
    return ctx.editMessageText('No hay productos activos para agregar stock.', Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Volver', 'admin_back')]
    ]));
  }

  const buttons = products.map(p => [Markup.button.callback(p.nombre, `select_stock_prod_${p.id}`)]);
  buttons.push([Markup.button.callback('🔙 Volver', 'admin_back')]);
  
  await ctx.editMessageText('📦 Selecciona el producto al que deseas agregar stock:', Markup.inlineKeyboard(buttons));
});

bot.action(/select_stock_prod_(.+)/, adminMiddleware, async (ctx) => {
  const productId = ctx.match[1];
  await ctx.answerCbQuery();
  // @ts-ignore
  ctx.scene.session.selectedProductId = productId;
  // @ts-ignore
  await ctx.scene.enter('ADD_STOCK_SCENE');
});

bot.action(/publish_never|publish_later|notify_none/, adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('Entendido, no se ha enviado ninguna notificación.');
});

bot.action(/publish_([a-z0-9\-]+)/, adminMiddleware, async (ctx) => {
  if (ctx.match[1] === 'never' || ctx.match[1] === 'later') return; // Handled above
  const productId = ctx.match[1];
  await ctx.answerCbQuery('Enviando notificaciones...');
  await ctx.editMessageText('Enviando notificaciones en segundo plano...');
  const result = await notificationService.sendNewProductNotification(productId);
  if (result) {
    await ctx.reply(`✅ Notificación enviada. Éxito: ${result.successCount}, Fallos: ${result.failCount}`);
  }
});

bot.action(/notify_stock_([a-z0-9\-]+)/, adminMiddleware, async (ctx) => {
  const productId = ctx.match[1];
  await ctx.answerCbQuery('Enviando notificaciones...');
  await ctx.editMessageText('Enviando notificaciones en segundo plano...');
  const result = await notificationService.sendNewStockNotification(productId);
  if (result) {
    await ctx.reply(`✅ Notificación de stock enviada. Éxito: ${result.successCount}, Fallos: ${result.failCount}`);
  }
});

bot.action(/admin_.+/, adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery('Esta función aún no está implementada.');
});

// Comando de usuario para recargar
bot.command('recargar', async (ctx) => {
  // @ts-ignore
  await ctx.scene.enter('RECHARGE_SCENE');
});

bot.start(async (ctx) => {
  await ctx.reply('¡Bienvenido! Usa /admin si eres administrador o /recargar para añadir saldo.');
});

// Inicio del bot
bot.launch().then(() => {
  console.log('🤖 Bot iniciado correctamente.');
}).catch((err) => {
  console.error('Error al iniciar el bot:', err);
});

// Detención segura
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
