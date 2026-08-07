import { Scenes, Markup } from 'telegraf';
import { supabase } from '../config/supabase';

const cancelKeyboard = Markup.keyboard(['❌ Cancelar']).resize();
const removeKeyboard = Markup.removeKeyboard();

export const addProductScene = new Scenes.WizardScene(
  'ADD_PRODUCT_SCENE',
  
  // Paso 0: Pedir Nombre
  async (ctx) => {
    // @ts-ignore
    ctx.scene.session.productData = {};
    await ctx.reply('➕ *Agregar producto*\n\nPor favor, ingresa el *nombre* del producto:', {
        parse_mode: 'Markdown',
        ...cancelKeyboard
    });
    return ctx.wizard.next();
  },
  
  // Paso 1: Recibir Nombre y Pedir Descripción
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
  
  // Paso 2: Recibir Descripción y Pedir Precio
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
      await ctx.reply('Ingresa el *precio* del producto en USDT (ejemplo: 0.90):', { parse_mode: 'Markdown' });
      return ctx.wizard.next();
    }
  },
  
  // Paso 3: Recibir Precio y Preguntar Tipo de Entrega
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
      
      await ctx.reply('Selecciona el tipo de entrega:', Markup.keyboard([
        ['Entrega automática', 'Entrega manual'],
        ['❌ Cancelar']
      ]).resize());
      return ctx.wizard.next();
    }
  },
  
  // Paso 4: Recibir Tipo de Entrega, Pedir Modalidad o Stock
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
        await ctx.reply('¿Qué tipo de contenido automático vas a entregar?', Markup.keyboard([
          ['El mismo para todos (Link/Curso)'],
          ['Cuentas únicas (Una por comprador)'],
          ['❌ Cancelar']
        ]).resize());
        return ctx.wizard.next();
        
      } else if (text === 'Entrega manual') {
        // @ts-ignore
        ctx.scene.session.productData.tipo_entrega = 'manual';
        // @ts-ignore
        ctx.scene.session.productData.tipo_contenido = 'manual';
        
        await ctx.reply('Ingresa el *stock* inicial de este producto manual:', {
          parse_mode: 'Markdown',
          ...cancelKeyboard
        });
        
        // Saltamos al paso 6 para procesar el stock manual
        ctx.wizard.selectStep(6);
        return;
      } else {
        await ctx.reply('⚠️ Selecciona una opción válida.');
        return;
      }
    }
  },

  // Paso 5: (Solo Automático) Recibir Modalidad, Pedir Contenido
  async (ctx) => {
    // @ts-ignore
    if (ctx.message && 'text' in ctx.message) {
      // @ts-ignore
      const text = ctx.message.text;
      if (text === '❌ Cancelar') {
        await ctx.reply('Proceso cancelado.', removeKeyboard);
        return ctx.scene.leave();
      }
      
      if (text === 'El mismo para todos (Link/Curso)') {
        // @ts-ignore
        ctx.scene.session.productData.tipo_contenido = 'estatico';
        await ctx.reply('Ingresa el *contenido* estático (link, clave, etc):', { parse_mode: 'Markdown', ...cancelKeyboard });
        
        // Saltaremos al paso 6 para pedir el stock después de que escriban el contenido
        return ctx.wizard.next();
        
      } else if (text === 'Cuentas únicas (Una por comprador)') {
        // @ts-ignore
        ctx.scene.session.productData.tipo_contenido = 'dinamico';
        await ctx.reply('Ingresa la lista de cuentas (UNA POR LÍNEA). El stock se calculará automáticamente según la cantidad de líneas:', { parse_mode: 'Markdown', ...cancelKeyboard });
        
        // Saltaremos al paso 6 para procesar las líneas
        return ctx.wizard.next();
        
      } else {
        await ctx.reply('⚠️ Selecciona una opción válida.');
        return;
      }
    }
  },

  // Paso 6: Recibir Contenido Automático (y pedir Stock si es estático) O recibir Stock (si es manual)
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
      const data = ctx.scene.session.productData;

      if (data.tipo_contenido === 'dinamico') {
        // Extraemos las cuentas
        const cuentas = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (cuentas.length === 0) {
           await ctx.reply('⚠️ No ingresaste ninguna cuenta válida. Intenta de nuevo:');
           return;
        }
        data.cuentas_lista = cuentas;
        data.stock = cuentas.length;
        data.contenido = 'Entrega desde inventario individual';
        
        await ctx.reply(`✅ Detectadas ${cuentas.length} cuentas. Stock ajustado a ${cuentas.length}.\n\nEnvía una *imagen o fotografía* del producto (o presiona "Omitir"):`, {
          parse_mode: 'Markdown',
          ...Markup.keyboard([['Omitir'], ['❌ Cancelar']]).resize()
        });
        
        // Saltamos al paso 8 (imagen) porque ya no necesitamos pedir el stock manual
        ctx.wizard.selectStep(8);
        return;

      } else if (data.tipo_contenido === 'estatico') {
        data.contenido = text;
        await ctx.reply('Ingresa la cantidad inicial de *stock* para este producto:', {
          parse_mode: 'Markdown',
          ...cancelKeyboard
        });
        // Vamos al paso 7 para recibir el número de stock
        return ctx.wizard.next();

      } else if (data.tipo_contenido === 'manual') {
        const stock = parseInt(text, 10);
        if (isNaN(stock) || stock < 0) {
          await ctx.reply('⚠️ Por favor ingresa una cantidad de stock válida.');
          return;
        }
        data.stock = stock;
        data.contenido = 'Entrega manual';
        
        await ctx.reply('Envía una *imagen o fotografía* del producto (o escribe "Omitir"):', {
            parse_mode: 'Markdown',
            ...Markup.keyboard([['Omitir'], ['❌ Cancelar']]).resize()
        });
        
        // Saltamos al paso 8 (imagen)
        ctx.wizard.selectStep(8);
        return;
      }
    }
  },

  // Paso 7: Recibir Stock (solo para estático) y Pedir Imagen
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
      
      await ctx.reply('Envía una *imagen o fotografía* del producto (o presiona "Omitir"):', {
        parse_mode: 'Markdown',
        ...Markup.keyboard([['Omitir'], ['❌ Cancelar']]).resize()
      });
      return ctx.wizard.next();
    }
  },

  // Paso 8: Recibir Imagen y Mostrar Vista Previa
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
        imageId = photos[photos.length - 1].file_id; 
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
Tipo: ${data.tipo_entrega} (${data.tipo_contenido})
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

  // Paso 9: Guardar en Base de Datos
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
        await ctx.answerCbQuery('Guardando en DB...');
        // @ts-ignore
        const data = ctx.scene.session.productData;
        
        // Guardar el producto padre
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

        // Si es inventario dinámico, insertar las cuentas en la tabla inventario_cuentas
        if (data.tipo_contenido === 'dinamico' && data.cuentas_lista) {
            const cuentasToInsert = data.cuentas_lista.map((cuenta: string) => ({
                id_producto: insertedProduct.id,
                contenido: cuenta,
                vendido: false
            }));

            const { error: errorInventario } = await supabase.from('inventario_cuentas').insert(cuentasToInsert);
            
            if (errorInventario) {
                console.error(errorInventario);
                await ctx.reply('⚠️ El producto se creó, pero hubo un error guardando las cuentas individuales.');
            }
        }

        await ctx.editMessageReplyMarkup(undefined);
        
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
