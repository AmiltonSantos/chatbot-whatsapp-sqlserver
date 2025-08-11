const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const conexao = require('./conexao');

const delay = ms => new Promise(res => setTimeout(res, ms)); // Função que usamos para criar o delay entre uma ação e outra

const sessoesUsuarios = new Map();
let numerosAutorizados = [];
let produtosMasVendidos = [];
let ofertaHoje = [];
let ofertaEspecias = [];
let ultimosPedidos = [];

let exportInfo = {
  qrCodeBase64: '',
  conectado: false,
  isInicializacao: false,
  isSpinner: false,
  client: undefined
}

// Inicia carramento do QRCode
async function criarCliente() {
  return new Promise(async (resolve, reject) => {
    try {
      numerosAutorizados = await conexao.carregarNumerosAutorizados();

      exportInfo.client = new Client({
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
    
      exportInfo.client.on('qr', async (qr) => {
        exportInfo.qrCodeBase64 = await qrcode.toDataURL(qr);
        exportInfo.isSpinner = false;
        exportInfo.conectado = true;
            
        // Inicialização do messager 
        if (!exportInfo.isInicializacao) {
          (async () => {
            resolve(true);
            await iniciandoMessage();
          })();
        }
        console.log('QR Code atualizado');
      });
    
      exportInfo.client.on('ready', () => {
        console.log('✅ WhatsApp conectado!');
        exportInfo.qrCodeBase64 = '';
      });
    
      exportInfo.client.on('auth_failure', msg => {
        console.error('Falha na autenticação:', msg);
        exportInfo.qrCodeBase64 = ''; // Limpa o QR ao conectar
        criarCliente(); // Cria novo client após desconectar
        exportInfo.client.initialize();
      });
    
      exportInfo.client.on('disconnected', () => {
        console.log('🔌 Desconectado.');
        exportInfo.qrCodeBase64 = ''; // Limpa o QR ao conectar
        criarCliente(); // Cria novo client após desconectar
        exportInfo.client.initialize();
      });
    
      exportInfo.client.initialize();

    } catch (err) {
      reject(err);
    }
  });  
}


// Verifica se é um contato privado e autorizado
function isPrivadoAutorizado(msg) {
  const numero = msg.from;
  return numero.endsWith('@c.us') && numerosAutorizados.includes(numero);
}

// Função para criar ou retornar a sessão do usuário
function getSessao(numero) {
  if (!sessoesUsuarios.has(numero)) {
    sessoesUsuarios.set(numero, { etapa: 'inicio', numero });
  }
  return sessoesUsuarios.get(numero);
}

// Funil
async function iniciandoMessage() {
  exportInfo.isInicializacao = true;
  exportInfo.client.on('message', async msg => {
    const numero = msg.from;

    // Ignora mensagens de grupos
    if (numero.endsWith('@g.us')) return;

    // Ignora se não for privado autorizado
    if (!isPrivadoAutorizado(msg)) return;

    // Obtém a sessão do usuário
    const sessao = getSessao(numero);

    // Exemplo de fluxo
    if (sessao.etapa === 'inicio') {
      if (msg.body.match(/(menu|Menu|dia|tarde|noite|oi|Oi|Olá|olá|ola|Ola|Eae|eae|tudo|bem|Bem|Tudo|como|Como|COMO|vai|Vai|VAI)/i)) {
        const chat = await msg.getChat();

        await delay(3000); //delay de 3 segundos
        await chat.sendStateTyping(); // Simulando Digitação
        await delay(3000); //Delay de 3000 milisegundos mais conhecido como 3 segundos
        const contact = await msg.getContact(); //Pegando o contato
        const name = contact.pushname; //Pegando o nome do contato
        await exportInfo.client.sendMessage(numero, 'Olá! *' + name.split(" ")[0] + '* Tudo bem?\n\nAqui é da *a1000ton Tecnologia.* \nComo posso ajudá-lo hoje? \nPor favor, digite uma das opções abaixo:\n\n*1 - Produtos mais vendidos*\n*2 - Ofertas de hoje*\n*3 - Ofertas especiais*\n*4 - Meus últimos pedidos*\n*5 - Outras perguntas*'); //Primeira mensagem de texto
        await delay(2000); //Delay de 2 segundos

        sessao.etapa = 'menu';
      }
    }

    // 1 - Produtos Mas vendidos
    if (sessao.etapa === 'menu') {
      if (msg.body !== null && msg.body === '1') {
        let resProdMasVend = '*1 - Produtos mais vendidos*\n\n';
        produtosMasVendidos = await conexao.carregarProdutosMasVendidos();
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
        await exportInfo.client.sendMessage(numero, `${resProdMasVend}`);
      }

      // 2 - Ofertas de Hoje
      if (msg.body !== null && msg.body === '2') {
        let resOfertaHoje = '*2 - Ofertas de hoje*\n\n';
        ofertaHoje = await conexao.carregarOfertasHoje();
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
        await exportInfo.client.sendMessage(numero, `${resOfertaHoje}`);
      }

      // 3 - Oferta Especiais
      if (msg.body !== null && msg.body === '3') {
        let resOfertaEspeciais = '*3 - Ofertas especiais*\n\n';
        ofertaEspecias = await conexao.carregarOfertasEspeciais();
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
        await exportInfo.client.sendMessage(numero, `${resOfertaEspeciais}`);
      }

      // 4 - Ultimos Pedidos
      if (msg.body !== null && msg.body === '4') {
        let resUltimosPedidos = '*4 - Meus últimos pedidos*\n\n';
        ultimosPedidos = await conexao.carregarUltimosPedidos();
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
        await exportInfo.client.sendMessage(numero, `${resUltimosPedidos}`);
      }

      // 5 - Outras perguntas
      if (msg.body !== null && msg.body === '5') {
        const chat = await msg.getChat();

        await delay(3000); //Delay de 3000 milisegundos mais conhecido como 3 segundos
        await chat.sendStateTyping(); // Simulando Digitação
        await delay(3000);
        await exportInfo.client.sendMessage(numero, `A *Artnew Tecnologia* agradece seu contato!`);
      }
    }
  });
}

// Exporta as funções para poder usar em outro arquivo
module.exports = {
  criarCliente,
  exportInfo
};