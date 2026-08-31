import { Scenes, Markup } from 'telegraf';
import { supabase } from '../config/supabase';

export const searchOrderScene = new Scenes.BaseScene<Scenes.SceneContext>('SEARCH_ORDER_SCENE');

searchOrderScene.enter(async (ctx) => {
  await ctx.reply('🔍 <b>Buscar Orden de Compra</b>\n\nPor favor, ingresa el <b>ID corto</b> de la orden (ej. A1B2C3D4) o el ID completo que te proporcionó el cliente.\n\nEscribe /cancelar para salir.', { parse_mode: 'HTML' });
});

searchOrderScene.command('cancelar', async (ctx) => {
  await ctx.reply('❌ Búsqueda cancelada.');
  return ctx.scene.leave();
});

searchOrderScene.on('text', async (ctx) => {
  const queryId = ctx.message.text.trim();
  
  if (queryId.startsWith('/')) return;

  // Buscar en la tabla compras. Si es UUID completo usamos eq, si es corto leemos todos (o los recientes) y filtramos
  let compras = [];
  if (queryId.length === 36 && queryId.includes('-')) {
      const { data } = await supabase.from('compras').select('*, usuarios(id_telegram, id), productos(nombre, tipo_entrega, contenido)').eq('id', queryId);
      if (data) compras = data;
  } else {
      const { data: allIds } = await supabase.from('compras').select('id');
      const matched = allIds?.filter(c => c.id.toUpperCase().startsWith(queryId.toUpperCase()));
      if (matched && matched.length > 0) {
          if (matched.length > 1) {
              await ctx.reply(`⚠️ Se encontraron ${matched.length} coincidencias. Por favor, ingresa un ID más completo (más de 8 caracteres).`);
              return ctx.scene.leave();
          }
          const { data } = await supabase.from('compras').select('*, usuarios(id_telegram, id), productos(nombre, tipo_entrega, contenido)').eq('id', matched[0].id);
          if (data) compras = data;
      }
  }

  if (!compras || compras.length === 0) {
    await ctx.reply(`❌ No se encontró ninguna orden que coincida con el ID: <b>${queryId}</b>.`, { parse_mode: 'HTML' });
    return ctx.scene.leave();
  }

  const compra = compras[0];
  // @ts-ignore
  const userIdTelegram = compra.usuarios?.id_telegram;
  // @ts-ignore
  const userUuid = compra.usuarios?.id;
  // @ts-ignore
  const productName = compra.productos?.nombre;
  
  let msg = `✅ <b>INFORMACIÓN DE LA ORDEN</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🧾 <b>ID Completo:</b> <code>${compra.id}</code>\n`;
  msg += `📅 <b>Fecha:</b> ${new Date(compra.fecha_compra).toLocaleString()}\n`;
  msg += `👤 <b>Comprador (Telegram ID):</b> <code>${userIdTelegram}</code>\n`;
  msg += `🛍️ <b>Producto:</b> ${productName} (x${compra.cantidad})\n`;
  msg += `💵 <b>Total Pagado:</b> $${compra.precio_pagado} USD\n`;
  msg += `⚙️ <b>Estado:</b> ${compra.estado}\n\n`;

  // Intentar obtener cuentas entregadas
  // @ts-ignore
  if (compra.productos?.tipo_entrega === 'automatica' && compra.productos?.contenido === 'Entrega desde inventario individual') {
      const { data: cuentas } = await supabase.from('inventario_cuentas')
          .select('contenido, fecha_vendido')
          .eq('id_comprador', userUuid)
          .eq('id_producto', compra.id_producto)
          .order('fecha_vendido', { ascending: false });
          
      if (cuentas && cuentas.length > 0) {
         msg += `🎁 <b>Historial de Cuentas Entregadas a este Usuario (Mismo producto):</b>\n`;
         for (const c of cuentas) {
             const f = new Date(c.fecha_vendido).toLocaleDateString();
             msg += `[${f}] <code>${c.contenido}</code>\n`;
         }
      }
  }

  let buttons = [];
  if (compra.estado !== 'entregada' && compra.estado !== 'reembolsada' && compra.estado !== 'cancelada') {
      buttons.push([Markup.button.callback('✅ Marcar como Entregado', `mark_delivered_${compra.id}`)]);
  }
  
  if (compra.estado !== 'reembolsada' && compra.estado !== 'cancelada') {
      buttons.push([Markup.button.callback('🔄 Devolver / Reembolsar', `refund_order_${compra.id}`)]);
  }

  await ctx.reply(msg, { 
      parse_mode: 'HTML',
      ...(buttons.length > 0 ? Markup.inlineKeyboard(buttons) : {})
  });
  return ctx.scene.leave();
});
