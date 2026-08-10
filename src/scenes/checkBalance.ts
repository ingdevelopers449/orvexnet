import { Scenes, Markup } from 'telegraf';
import { supabase } from '../config/supabase';

export const checkBalanceScene = new Scenes.BaseScene<any>('CHECK_BALANCE_SCENE');

checkBalanceScene.enter(async (ctx) => {
    await ctx.reply(
        '🔎 <b>CONSULTAR SALDO DE USUARIO</b>\n\n' +
        'Por favor, ingresa el <b>ID de Telegram</b> o el <b>@Username</b> del usuario que deseas consultar:\n\n' +
        '<i>(Escribe /cancelar para salir)</i>',
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('❌ Cancelar', 'cancel_check')]
            ])
        }
    );
});

checkBalanceScene.action('cancel_check', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText('❌ Operación cancelada.');
    return ctx.scene.leave();
});

checkBalanceScene.on('text', async (ctx) => {
    const query = ctx.message.text.trim();

    if (query === '/cancelar') {
        await ctx.reply('❌ Operación cancelada.');
        return ctx.scene.leave();
    }

    try {
        let user;
        
        // If it starts with @ or is not a number, search by username
        if (query.startsWith('@') || isNaN(Number(query))) {
            const cleanUsername = query.replace('@', '');
            const { data, error } = await supabase
                .from('usuarios')
                .select('*')
                .ilike('nombre_usuario', cleanUsername)
                .single();
                
            if (error || !data) {
                await ctx.reply(`❌ No se encontró ningún usuario con el username @${cleanUsername}.\nIntenta con otro o escribe /cancelar.`);
                return;
            }
            user = data;
        } else {
            // Search by Telegram ID
            const { data, error } = await supabase
                .from('usuarios')
                .select('*')
                .eq('id_telegram', query)
                .single();
                
            if (error || !data) {
                await ctx.reply(`❌ No se encontró ningún usuario con el ID ${query}.\nIntenta con otro o escribe /cancelar.`);
                return;
            }
            user = data;
        }

        const msg = `🔎 <b>RESULTADO DE CONSULTA</b>
━━━━━━━━━━━━━━━━━━━━━━━
👤 <b>Usuario:</b> ${user.nombre} ${user.nombre_usuario ? `(@${user.nombre_usuario})` : ''}
🆔 <b>ID Telegram:</b> <code>${user.id_telegram}</code>
💰 <b>Saldo Actual:</b> <code style="color: green">$${user.saldo} USD</code>
🚫 <b>Estado:</b> ${user.bloqueado ? 'BLOQUEADO' : 'ACTIVO'}
━━━━━━━━━━━━━━━━━━━━━━━`;

        await ctx.reply(msg, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Volver al panel', 'admin_back')]
            ])
        });
        
        return ctx.scene.leave();
    } catch (e) {
        console.error('Error al consultar saldo:', e);
        await ctx.reply('❌ Ocurrió un error al buscar el usuario.');
        return ctx.scene.leave();
    }
});
