import { Telegraf, Scenes, Markup, Context } from 'telegraf';
import { config } from './config/env';
import { supabase } from './config/supabase';
import LocalSession from 'telegraf-session-local';
import { addProductScene } from './scenes/addProduct';
import { addStockScene } from './scenes/addStock';
import { rechargeScene } from './scenes/recharge';
import { manualRechargeScene } from './scenes/manualRecharge';
import { searchOrderScene } from './scenes/searchOrder';
import { editProductScene } from './scenes/editProduct';
import { announcementScene } from './scenes/announcement';
import { blockUserScene } from './scenes/blockUser';
import { NotificationService } from './services/notifications';
import { setupUserRoutes } from './controllers/userController';
import { setupAdminRoutes } from './controllers/adminController';

if (!config.telegram.botToken) {
  throw new Error('BOT_TOKEN is missing in environment variables.');
}

const bot = new Telegraf(config.telegram.botToken);

// Middleware para registrar usuarios automáticamente
bot.use(async (ctx, next) => {
  if (ctx.from && !ctx.from.is_bot) {
    const { data: user, error: selectError } = await supabase
      .from('usuarios')
      .select('id, bloqueado')
      .eq('id_telegram', ctx.from.id)
      .single();

    if (selectError && selectError.code === 'PGRST116') {
      const { error: insertError } = await supabase.from('usuarios').insert([
        {
          id_telegram: ctx.from.id,
          nombre: ctx.from.first_name || '',
          nombre_usuario: ctx.from.username || null,
        }
      ]);
      if (insertError) {
        console.error('Error al insertar usuario:', insertError);
      }
    } else if (user && user.bloqueado) {
      // Bloquear cualquier comando si el usuario está baneado
      if (ctx.message || ctx.callbackQuery) {
          try {
             await ctx.reply('⛔ Tu cuenta ha sido bloqueada por un administrador.');
          } catch(e) {}
      }
      return; // Detener flujo
    }
  }
  return next();
});

// Middleware de Membresía Obligatoria
bot.use(async (ctx, next) => {
  if (!ctx.from || ctx.from.is_bot) return next();

  try {
    const { data: configRow } = await supabase.from('configuracion_bot').select('valor').eq('clave', 'canal_telegram').single();
    const canal = configRow?.valor;

    if (!canal) return next();

    const channelId = canal.startsWith('@') ? canal : `@${canal}`;
    const member = await ctx.telegram.getChatMember(channelId, ctx.from.id);
    const isMember = ['member', 'administrator', 'creator'].includes(member.status);
    
    // @ts-ignore
    const cbData = ctx.callbackQuery?.data;

    if (isMember) {
      if (cbData === 'check_membership') {
        await ctx.answerCbQuery('✅ ¡Gracias por unirte! Ya puedes usar el bot.');
        await ctx.deleteMessage().catch(() => {});
        // Enviar un start simulado
        const supportUrl = 'Soporte'; // Dummy or we can just send text
        await ctx.reply('✅ Gracias por unirte. Escribe /start para ver el menú principal.');
        return;
      }
      return next();
    } else {
      if (cbData === 'check_membership') {
         await ctx.answerCbQuery('❌ Aún no te has unido al canal. Revisa bien.', { show_alert: true });
         return; 
      }

      const link = `https://t.me/${channelId.replace('@', '')}`;
      const msg = `📢 <b>¡Atención!</b>\n\nPara poder utilizar este bot, es <b>obligatorio</b> que te unas a nuestro canal oficial.\n\nÚnete tocando el botón de abajo y luego presiona "✅ Ya me uní".`;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.url('🔗 Unirse al Canal', link)],
        [Markup.button.callback('✅ Ya me uní', 'check_membership')]
      ]);

      if (ctx.callbackQuery) {
        await ctx.answerCbQuery().catch(() => {});
        await ctx.editMessageText(msg, { parse_mode: 'HTML', ...keyboard }).catch(() => {});
      } else {
        await ctx.reply(msg, { parse_mode: 'HTML', ...keyboard }).catch(() => {});
      }
      return; 
    }
  } catch (e) {
    console.error('Error al verificar canal:', e);
    return next();
  }
});

// Configuración de Sesiones y Escenas
const localSession = new LocalSession({ database: 'session_db.json' });
bot.use(localSession.middleware());

// El stage central (Añadiremos ANNOUNCEMENT_SCENE y BLOCK_USER_SCENE después)
const stage = new Scenes.Stage<any>([
  addProductScene, 
  addStockScene, 
  rechargeScene, 
  manualRechargeScene, 
  searchOrderScene, 
  editProductScene,
  announcementScene,
  blockUserScene
]);

// Sistema de escape global
stage.command('cancelar', async (ctx) => {
  await ctx.scene.leave();
  await ctx.reply('❌ Acción cancelada.', Markup.removeKeyboard());
});
stage.command('start', async (ctx, next) => {
  await ctx.scene.leave();
  return next();
});

bot.use(stage.middleware());

const notificationService = new NotificationService(bot);

// ===============================================
// INICIALIZACIÓN DE CONTROLADORES (MVC)
// ===============================================
setupAdminRoutes(bot, notificationService);
setupUserRoutes(bot);

// ===============================================
// INICIO DEL BOT
// ===============================================
bot.launch().then(() => {
  console.log('🤖 Bot iniciado correctamente con arquitectura MVC.');
}).catch((err) => {
  console.error('Error al iniciar el bot:', err);
});

// Detención segura
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
