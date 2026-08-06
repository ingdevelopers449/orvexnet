import { Scenes, Markup } from 'telegraf';
import { supabase } from '../config/supabase';

// Helper function para salir de la escena
const cancelKeyboard = Markup.keyboard(['❌ Cancelar']).resize();
const removeKeyboard = Markup.removeKeyboard();

export const addProductScene = new Scenes.WizardScene(
  'ADD_PRODUCT_SCENE',
  // Paso 1: Pedir Nombre
  async (ctx) => {
    // @ts-ignore
    ctx.scene.session.productData = {};
    await ctx.reply('➕ **Agregar producto**\n\nPor favor, ingresa el *nombre* del producto:', {
        parse_mode: 'Markdown',
        ...cancelKeyboard
    });
    return ctx.wizard.next();
  },
  // Paso 2: Recibir Nombre y Pedir Descripción
  async (ctx) => {
    // @ts-ignore
    if (ctx.message && 'text' in ctx.message) {
      // @ts-ignore
      const text = ctx.message.text;
      if (text === '❌ Cancelar') {
        await ctx.reply('Proceso cancelado.', removeKeyboard);
        return ctx.scene.leave();
      }
      // @ts-ignore
      ctx.scene.session.productData.nombre = text;
      await ctx.reply('Ingresa la *descripción* del producto:', { parse_mode: 'Markdown' });
      return ctx.wizard.next();
    }
  },
  // Paso 3: Recibir Descripción y Pedir Precio
  async (ctx) => {
    // @ts-ignore
    if (ctx.message && 'text' in ctx.message) {
      // @ts-ignore
      const text = ctx.message.text;
      if (text === '❌ Cancelar') {
        await ctx.reply('Proceso cancelado.', removeKeyboard);
        return ctx.scene.leave();
      }
      // @ts-ignore
      ctx.scene.session.productData.descripcion = text;
      await ctx.reply('Ingresa el *precio* del producto (ejemplo: 0.90):', { parse_mode: 'Markdown' });
      return ctx.wizard.next();
    }
  },
  // Paso 4: Recibir Precio y Pedir Stock
  async (ctx) => {
    // @ts-ignore
    if (ctx.message && 'text' in ctx.message) {
      // @ts-ignore
      const text = ctx.message.text;
      if (text === '❌ Cancelar') {
        await ctx.reply('Proceso cancelado.', removeKeyboard);
        return ctx.scene.leave();
      }
      const price = parseFloat(text.replace(',', '.'));
      if (isNaN(price) || price <= 0) {
        await ctx.reply('⚠️ Por favor ingresa un precio válido mayor a 0.');
        return;
      }
      // @ts-ignore
      ctx.scene.session.productData.precio = price;
      await ctx.reply('Ingresa la cantidad inicial de *stock*:', { parse_mode: 'Markdown' });
      return ctx.wizard.next();
    }
  },
  // Paso 5: Recibir Stock y Pedir Tipo de Entrega
  async (ctx) => {
    // @ts-ignore
    if (ctx.message && 'text' in ctx.message) {
      // @ts-ignore
      const text = ctx.message.text;
      if (text === '❌ Cancelar') {
        await ctx.reply('Proceso cancelado.', removeKeyboard);
        return ctx.scene.leave();
      }
      const stock = parseInt(text, 10);
      if (isNaN(stock) || stock < 0) {
        await ctx.reply('⚠️ Por favor ingresa una cantidad de stock válida.');
        return;
      }
      // @ts-ignore
      ctx.scene.session.productData.stock = stock;
      await ctx.reply('Selecciona el tipo de entrega:', Markup.keyboard([
        ['Entrega automática', 'Entrega manual'],
        ['❌ Cancelar']
      ]).resize());
      return ctx.wizard.next();
    }
  },
  // Paso 6: Recibir Tipo de Entrega, Condicional para Contenido
  async (ctx) => {
    // @ts-ignore
    if (ctx.message && 'text' in ctx.message) {
      // @ts-ignore
      const text = ctx.message.text;
      if (text === '❌ Cancelar') {
        await ctx.reply('Proceso cancelado.', removeKeyboard);
        return ctx.scene.leave();
      }
      if (text === 'Entrega automática') {
        // @ts-ignore
        ctx.scene.session.productData.tipo_entrega = 'automatica';
        await ctx.reply('Ingresa el *contenido* del producto que se entregará al comprador:', {
            parse_mode: 'Markdown',
            ...cancelKeyboard
        });
        return ctx.wizard.next();
      } else if (text === 'Entrega manual') {
        // @ts-ignore
        ctx.scene.session.productData.tipo_entrega = 'manual';
        // @ts-ignore
        ctx.scene.session.productData.contenido = null;
        // Saltamos el paso de contenido manual simulando el next
        await ctx.reply('Envía una *imagen o fotografía* del producto (o escribe "Omitir"):', {
            parse_mode: 'Markdown',
            ...Markup.keyboard([['Omitir'], ['❌ Cancelar']]).resize()
        });
        // Saltamos al paso 8 (index 7)
        ctx.wizard.selectStep(7);
        return;
      } else {
        await ctx.reply('⚠️ Selecciona una opción válida.');
        return;
      }
    }
  },
  // Paso 7: Recibir Contenido (si es automático) y pedir Imagen
  async (ctx) => {
    // @ts-ignore
    if (ctx.message && 'text' in ctx.message) {
      // @ts-ignore
      const text = ctx.message.text;
      if (text === '❌ Cancelar') {
        await ctx.reply('Proceso cancelado.', removeKeyboard);
        return ctx.scene.leave();
      }
      // @ts-ignore
      ctx.scene.session.productData.contenido = text;
      await ctx.reply('Envía una *imagen o fotografía* del producto (o presiona "Omitir"):', {
        parse_mode: 'Markdown',
        ...Markup.keyboard([['Omitir'], ['❌ Cancelar']]).resize()
      });
      return ctx.wizard.next();
    }
  },
  // Paso 8: Recibir Imagen y mostrar Vista Previa
  async (ctx) => {
    // @ts-ignore
    if (ctx.message) {
      // @ts-ignore
      if (ctx.message.text === '❌ Cancelar') {
        await ctx.reply('Proceso cancelado.', removeKeyboard);
        return ctx.scene.leave();
      }
      
      // @ts-ignore
      let imageId = null;
      // @ts-ignore
      if (ctx.message.photo) {
        // @ts-ignore
        const photos = ctx.message.photo;
        imageId = photos[photos.length - 1].file_id; // Tomar la mejor calidad
      }
      // @ts-ignore
      ctx.scene.session.productData.imagen_url = imageId;

      // Generar Vista Previa
      // @ts-ignore
      const data = ctx.scene.session.productData;
      
      const previewText = `📦 *Nuevo producto*

Nombre: ${data.nombre}
Precio: Desde $${data.precio} USD
Stock: ${data.stock} unidades
Estado: 🟢 Activo`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ Guardar producto', 'save_product')],
        [Markup.button.callback('✏️ Editar', 'edit_product'), Markup.button.callback('❌ Cancelar', 'cancel_product')]
      ]);

      if (data.imagen_url) {
        await ctx.replyWithPhoto(data.imagen_url, {
          caption: previewText,
          parse_mode: 'Markdown',
          reply_markup: keyboard.reply_markup
        });
      } else {
        await ctx.reply(previewText, {
          parse_mode: 'Markdown',
          reply_markup: keyboard.reply_markup
        });
      }
      await ctx.reply('Seleccione una acción:', removeKeyboard);
      return ctx.wizard.next();
    }
  },
  // Paso 9: Manejar botones de Vista Previa
  async (ctx) => {
    // @ts-ignore
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      // @ts-ignore
      const action = ctx.callbackQuery.data;
      if (action === 'cancel_product') {
        await ctx.answerCbQuery('Cancelado');
        await ctx.editMessageReplyMarkup(undefined);
        await ctx.reply('Creación cancelada.');
        return ctx.scene.leave();
      } else if (action === 'edit_product') {
        await ctx.answerCbQuery('Reiniciando proceso...');
        await ctx.editMessageReplyMarkup(undefined);
        ctx.wizard.selectStep(0);
        // @ts-ignore
        return ctx.wizard.steps[0](ctx);
      } else if (action === 'save_product') {
        await ctx.answerCbQuery('Guardando...');
        // @ts-ignore
        const data = ctx.scene.session.productData;
        
        // Guardar en Supabase
        const { data: insertedProduct, error } = await supabase.from('productos').insert([{
            nombre: data.nombre,
            descripcion: data.descripcion,
            precio: data.precio,
            stock: data.stock,
            tipo_entrega: data.tipo_entrega,
            contenido: data.contenido,
            imagen_url: data.imagen_url,
            activo: true
        }]).select().single();

        if (error) {
          console.error(error);
          await ctx.reply('❌ Ocurrió un error al guardar el producto en la base de datos.');
          return ctx.scene.leave();
        }

        await ctx.editMessageReplyMarkup(undefined);
        
        // Preguntar por anuncio
        await ctx.reply(`✅ Producto creado correctamente.\n\n¿Deseas anunciarlo a los clientes?`, Markup.inlineKeyboard([
            [Markup.button.callback('📢 Publicar nuevo producto', `publish_${insertedProduct.id}`)],
            [Markup.button.callback('🕒 Publicar después', 'publish_later')],
            [Markup.button.callback('❌ No publicar', 'publish_never')]
        ]));

        return ctx.scene.leave();
      }
    }
  }
);
