const sql = require('mssql');
const config = require('./config');


// Pega as configurações de acesso do Sqlserver
async function conectSqlserver(sendQuery) {
  return new Promise(async (resolve, reject) => {
    try {
      await sql.connect(config);
      const result = await sql.query(sendQuery);
      resolve(result.recordset);
    } catch (err) {
      reject(err);
    } finally {
      await sql.close();
    }
  });
}

// Carrega os números da tabela do Postgres que vai ser altorizados a enviar mensagens
async function carregarNumerosAutorizados() {
  return new Promise(async (resolve, reject) => {
    try {
      const queryNumeros = await conectSqlserver('SELECT numero, responsavel FROM numeros');

      const resultFilter = queryNumeros
        .filter(row => row.numero) // ignora valores nulos/undefined
        .map(row => row.numero.trim() + '@c.us');
      
      resolve(resultFilter); 
    } catch (err) {
      reject(err);
      console.error('1 - Erro no processamento da query no Postgres:', err);
    }
  });
}

// Carrega os produtos mas vendidos
async function carregarProdutosMasVendidos() {
  return new Promise(async (resolve, reject) => {
    try {
      const queryMasVendidos = await conectSqlserver(`
           SELECT TOP 3  
            p.nome,
            p.quantidadeCaixa,
            tp.precoProduto,
            tp.percentualDesconto
        FROM produto p
        INNER JOIN tabela_preco_produto tp ON tp.produtoId = p.id
        WHERE tp.percentualDesconto > 3
      `);

      resolve(queryMasVendidos); 
    } catch (err) {
      reject(err);
      console.error('2 - Erro no processamento da query no Postgres:', err);
    }
  });
}

// Carrega ofertas de hoje
async function carregarOfertasHoje() {
  return new Promise(async (resolve, reject) => {
    try {
      const queryOfertaHoje = await conectSqlserver(`      
          SELECT TOP 3
              produtoNomeStr,
              quantidadeComprada,
              valor
          FROM item_pedido_temp 
          ORDER BY pedidoTempid DESC        
      `);

      resolve(queryOfertaHoje);
    } catch (err) {
      reject(err);
      console.error('3 - Erro no processamento da query no Postgres:', err);
    }
  });
}

// Carrega dados oferta especiais
async function carregarOfertasEspeciais() {
  return new Promise(async (resolve, reject) => {
    try {
      const queryOfertaEspeciais = await conectSqlserver(`
          SELECT TOP 3
              i.produtoNomeStr,
              p.dataEnvioPedido,
              i.valor
          FROM pedido_temp p 
          INNER JOIN item_pedido_temp i ON i.pedidoTempid = p.id
          WHERE p.statusPedido = 1
          ORDER BY pedidoTempid DESC
      `);
        
      resolve(queryOfertaEspeciais);
    } catch (err) {
      reject(err);
      console.error('4 - Erro no processamento da query no Postgres:', err);
    }
  });
}

// Carrega dados ultimos pedidos
async function carregarUltimosPedidos() {
  return new Promise(async (resolve, reject) => {
    try {
      const queryUltimosPedidos = await conectSqlserver(`
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
      
      resolve(queryUltimosPedidos);
    } catch (err) {
      reject(err);
      console.error('5 - Erro no processamento da query no Postgres:', err);
    }
  });
}

// Exporta as funções para poder usar em outro arquivo
module.exports = {
  carregarNumerosAutorizados,
  carregarProdutosMasVendidos,
  carregarOfertasHoje,
  carregarOfertasEspeciais,
  carregarUltimosPedidos
};