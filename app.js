const sql = require('mssql');
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const app = express();
const port = 3000;

app.use(express.urlencoded({ extended: true })); // Para poder receber POST
const authPath = path.join(__dirname, '.wwebjs_auth'); // pasta onde salva o login
const authCache = path.join(__dirname, '.wwebjs_cache'); // cookies e dados temporários da sessão

const sessoesUsuarios = new Map();
let numerosAutorizados = [];
let produtosMasVendidos = [];
let ofertaHoje = [];
let ofertaEspecias = [];
let ultimosPedidos = [];

let qrCodeBase64 = '';
let client;
let conectado = false;
let isSpinner = false;
let isInicializacao = false;

const delay = ms => new Promise(res => setTimeout(res, ms)); // Função que usamos para criar o delay entre uma ação e outra

// Carrega os números do SQL Server e adiciona @c.us
async function carregarNumerosAutorizados() {
  try {
    await sql.connect(config);
    const result = await sql.query('SELECT numero, responsavel FROM numeros');

    numerosAutorizados = result.recordset
      .filter(row => row.numero) // ignora valores nulos/undefined
      .map(row => row.numero.trim() + '@c.us');
    } catch (err) {
    console.error('Erro ao carregar números do SQL Server:', err);
  } finally {
    await sql.close();
  }
}

// Carrega os números do SQL Server e adiciona @c.us
async function carregarProdutosMasVendidos() {
  try {
    await sql.connect(config);
    const result = await sql.query(`
            SELECT TOP 3  
                p.nome,
                p.quantidadeCaixa,
                tp.precoProduto,
                tp.percentualDesconto
            FROM produto p
            INNER JOIN tabela_preco_produto tp ON tp.produtoId = p.id
            WHERE tp.percentualDesconto > 3
        `);

    produtosMasVendidos = result.recordset;
  } catch (err) {
    console.error('Erro ao carregar Produtos mas vendidos do SQL Server:', err);
  } finally {
    await sql.close();
  }
}

// Carrega os números do SQL Server e adiciona @c.us
async function carregarOfertasHoje() {
  try {
    await sql.connect(config);
    const result = await sql.query(`
            SELECT TOP 3
                produtoNomeStr,
                quantidadeComprada,
                valor
            FROM item_pedido_temp 
            ORDER BY pedidoTempid DESC
        `);

    ofertaHoje = result.recordset;
  } catch (err) {
    console.error('Erro ao carregar Produtos mas vendidos do SQL Server:', err);
  } finally {
    await sql.close();
  }
}

// Carrega os números do SQL Server e adiciona @c.us
async function carregarOfertasEspeciais() {
  try {
    await sql.connect(config);
    const result = await sql.query(`
            SELECT TOP 3
                i.produtoNomeStr,
                p.dataEnvioPedido,
                i.valor
            FROM pedido_temp p 
            INNER JOIN item_pedido_temp i ON i.pedidoTempid = p.id
            WHERE p.statusPedido = 1
            ORDER BY pedidoTempid DESC
        `);

    ofertaEspecias = result.recordset;
  } catch (err) {
    console.error('Erro ao carregar Produtos mas vendidos do SQL Server:', err);
  } finally {
    await sql.close();
  }
}

// Carrega os números do SQL Server e adiciona @c.us
async function carregarUltimosPedidos() {
  try {
    await sql.connect(config);
    const result = await sql.query(`
            SELECT TOP 3
                i.produtoNomeStr,
                i.quantidadeComprada,
                i.valor,
                p.dataEnvioPedido
            FROM pedido_temp p 
            INNER JOIN item_pedido_temp i ON i.pedidoTempid = p.id
            WHERE p.statusPedido = 1
            ORDER BY pedidoTempid DESC
        `);

    ultimosPedidos = result.recordset;
  } catch (err) {
    console.error('Erro ao carregar Produtos mas vendidos do SQL Server:', err);
  } finally {
    await sql.close();
  }
}

async function criarCliente() {
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage' // Importante para ambientes com pouca memória
      ]
    }
  });

  client.on('qr', async (qr) => {
    qrCodeBase64 = await qrcode.toDataURL(qr);
    isSpinner = false;
    conectado = true;

    // Inicialização do messager 
    if (!isInicializacao) {
      (async () => {
        await iniciandoMessage();
      })();
    }
    console.log('QR Code atualizado');
  });

  client.on('ready', () => {
    console.log('✅ WhatsApp conectado!');
    qrCodeBase64 = '';
  });

  client.on('auth_failure', msg => {
    console.error('Falha na autenticação:', msg);
    qrCodeBase64 = ''; // Limpa o QR ao conectar
    criarCliente(); // Cria novo client após desconectar
    client.initialize();
  });

  client.on('disconnected', () => {
    console.log('🔌 Desconectado.');
    qrCodeBase64 = ''; // Limpa o QR ao conectar
    criarCliente(); // Cria novo client após desconectar
    client.initialize();
  });

  client.initialize();
}

// Funil
async function iniciandoMessage() {
  isInicializacao = true;
  client.on('message', async msg => {
    const numero = msg.from;

    if (!numerosAutorizados.includes(numero)) return; // Ignora quem não estiver na lista
    if (!numero.endsWith('@c.us')) return; // ignora grupos

    // Inicia sessão se ainda não existir
    if (!sessoesUsuarios.has(numero)) {
      sessoesUsuarios.set(numero, { etapa: 'inicio' });
    }

    const sessao = sessoesUsuarios.get(numero);

    // Exemplo de fluxo
    if (sessao.etapa === 'inicio') {
      if (msg.body.match(/(menu|Menu|dia|tarde|noite|oi|Oi|Olá|olá|ola|Ola|Eae|eae|tudo|bem|Bem|Tudo)/i) && msg.from.endsWith('@c.us')) {
        const chat = await msg.getChat();

        await delay(3000); //delay de 3 segundos
        await chat.sendStateTyping(); // Simulando Digitação
        await delay(3000); //Delay de 3000 milisegundos mais conhecido como 3 segundos
        const contact = await msg.getContact(); //Pegando o contato
        const name = contact.pushname; //Pegando o nome do contato
        await client.sendMessage(msg.from, 'Olá! *' + name.split(" ")[0] + '* Tudo bem?\n\nAqui é da *a1000ton Tecnologia.* \nComo posso ajudá-lo hoje? \nPor favor, digite uma das opções abaixo:\n\n*1 - Produtos mais vendidos*\n*2 - Ofertas de hoje*\n*3 - Ofertas especiais*\n*4 - Meus últimos pedidos*\n*5 - Outras perguntas*'); //Primeira mensagem de texto
        await delay(3000); //delay de 3 segundos
        await chat.sendStateTyping(); // Simulando Digitação
        await delay(2000); //Delay de 2 segundos

        sessao.etapa = 'menu';
      }
    }

    // 1 - Produtos Mas vendidos
    if (sessao.etapa === 'menu' && msg.body !== null && msg.body === '1' && msg.from.endsWith('@c.us')) {
      let resProdMasVend = '*1 - Produtos mais vendidos*\n\n';
      await carregarProdutosMasVendidos();
      const chat = await msg.getChat();

      produtosMasVendidos.forEach(vend => {
        resProdMasVend +=
          `*Produto:* ${vend.nome}\n` +
          `*Caixa:* ${vend.quantidadeCaixa} un\n` +
          `*Preço:* R$ ${vend.precoProduto.toFixed(2).replace('.', ',')}\n` +
          `*Desconto:* ${vend.percentualDesconto}%\n\n`;
      });

      await delay(3000); //Delay de 3000 milisegundos mais conhecido como 3 segundos
      await chat.sendStateTyping(); // Simulando Digitação
      await delay(2000);
      await client.sendMessage(msg.from, `${resProdMasVend}`);
    }

    // 2 - Ofertas de Hoje
    if (sessao.etapa === 'menu' && msg.body !== null && msg.body === '2' && msg.from.endsWith('@c.us')) {
      let resOfertaHoje = '*2 - Ofertas de hoje*\n\n';
      await carregarOfertasHoje();
      const chat = await msg.getChat();

      ofertaHoje.forEach(hoje => {
        resOfertaHoje +=
          `*Produto:* ${hoje.produtoNomeStr}\n` +
          `*Quantidade:* ${hoje.quantidadeComprada} un\n` +
          `*Preço:* R$ ${hoje.valor}\n\n`;
      });

      await delay(3000); //Delay de 3000 milisegundos mais conhecido como 3 segundos
      await chat.sendStateTyping(); // Simulando Digitação
      await delay(2000);
      await client.sendMessage(msg.from, `${resOfertaHoje}`);
    }

    // 3 - Oferta Especiais
    if (sessao.etapa === 'menu' && msg.body !== null && msg.body === '3' && msg.from.endsWith('@c.us')) {
      let resOfertaEspeciais = '*3 - Ofertas especiais*\n\n';
      await carregarOfertasEspeciais();
      const chat = await msg.getChat();

      ofertaEspecias.forEach(esp => {
        resOfertaEspeciais +=
          `*Produto:* ${esp.produtoNomeStr}\n` +
          `*Valor:* R$ ${esp.valor}\n` +
          `*Data Oferta:* ${esp.dataEnvioPedido}\n\n`;
      });

      await delay(3000); //Delay de 3000 milisegundos mais conhecido como 3 segundos
      await chat.sendStateTyping(); // Simulando Digitação
      await delay(2000);
      await client.sendMessage(msg.from, `${resOfertaEspeciais}`);
    }

    // 4 - Ultimos Pedidos
    if (sessao.etapa === 'menu' && msg.body !== null && msg.body === '4' && msg.from.endsWith('@c.us')) {
      let resUltimosPedidos = '*4 - Meus últimos pedidos*\n\n';
      await carregarUltimosPedidos();
      const chat = await msg.getChat();

      ultimosPedidos.forEach(ult => {
        resUltimosPedidos +=
          `*Produto:* ${ult.produtoNomeStr}\n` +
          `*Quantidade:* ${ult.quantidadeComprada} un\n` +
          `*Valor:* R$ ${ult.valor}\n` +
          `*Data:* ${ult.dataEnvioPedido}\n\n`;
      });

      await delay(3000); //Delay de 3000 milisegundos mais conhecido como 3 segundos
      await chat.sendStateTyping(); // Simulando Digitação
      await delay(2000);
      await client.sendMessage(msg.from, `${resUltimosPedidos}`);
    }

    // 5 - Outras perguntas
    if (sessao.etapa === 'menu' && msg.body !== null && msg.body === '5' && msg.from.endsWith('@c.us')) {
      const chat = await msg.getChat();

      await delay(3000); //Delay de 3000 milisegundos mais conhecido como 3 segundos
      await chat.sendStateTyping(); // Simulando Digitação
      await delay(3000);
      await client.sendMessage(msg.from, `A *Artnew Tecnologia* agradece seu contato!`);
    }
  });
}

// Rota principal
app.get('/', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'index.html');
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) return res.status(500).send('Erro ao carregar HTML');

    const finalHtml = html
      .replace('{{SPINNER}}', isSpinner ? '<div class="spinner"></div>' : '')
      .replace('{{QRCODE}}', qrCodeBase64 ? `<img src="${qrCodeBase64}" />` : 'QR Code')
      .replace('{{ACTION}}', conectado ? '/logout' : '/login')
      .replace('{{CLASS_BOTAO}}', conectado ? 'btnDesc' : 'btn')
      .replace('{{CLASS_ICON}}', conectado ? 'iconDesc' : 'icon')
      .replace('{{SPAN}}', conectado ? 'Desconectar' : 'Gerar QR CODE');

    res.send(finalHtml);
  });
});

// Rota para desconectar
app.post('/logout', async (req, res) => {
  if (client) {
    await client.destroy();
    client = '';
    conectado = false;
    isInicializacao = false;
    qrCodeBase64 = ''

    if (fs.existsSync(authPath)) {
      fs.rmSync(authPath, { recursive: true, force: true });
      console.log('Sessão removida.');
    }

    if (fs.existsSync(authCache)) {
      fs.rmSync(authCache, { recursive: true, force: true });
      console.log('Cookies e dados temporários removidas.');
    }
    console.log('Sessão encerrada manualmente.');
  }
  res.redirect('/');
});

// Rota para desconectar
app.post('/login', async (req, res) => {
  if (!client) {
    isSpinner = true;
    await carregarNumerosAutorizados();
    await criarCliente(); // Cria novo client após desconectar
    console.log('Sessão iniciada.');
  }
  res.redirect('/');
});

app.listen(port, () => {
  console.log(`🟢 Servidor rodando em: http://localhost:${port}`);
});
