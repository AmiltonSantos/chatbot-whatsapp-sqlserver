const express = require('express');
const fs = require('fs');
const path = require('path');
const whatsapp = require('./whatsapp');
const { exportInfo } = require('./whatsapp');

const app = express();
const port = 3000;

app.use(express.urlencoded({ extended: true })); // Para poder receber POST
const authPath = path.join(__dirname, '..', '.wwebjs_auth'); // pasta onde salva o login
const authCache = path.join(__dirname, '..', '.wwebjs_cache'); // cookies e dados temporários da sessão

// Rota principal
app.get('/', (req, res) => {
  const filePath = path.join(__dirname, '..', 'public', 'index.html');
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) return res.status(500).send('Erro ao carregar HTML');

    const finalHtml = html
      .replace('{{SPINNER}}', exportInfo.isSpinner ? '<div class="spinner"></div>' : '')
      .replace('{{QRCODE}}', exportInfo.qrCodeBase64 ? `<img src="${exportInfo.qrCodeBase64}" />` : 'QR Code')
      .replace('{{ACTION}}', exportInfo.conectado ? '/logout' : '/login')
      .replace('{{CLASS_BOTAO}}', exportInfo.conectado ? 'btnDesc' : 'btn')
      .replace('{{CLASS_ICON}}', exportInfo.conectado ? 'iconDesc' : 'icon')
      .replace('{{SPAN}}', exportInfo.conectado ? 'Desconectar' : 'Gerar QR CODE');

    res.send(finalHtml);
  });
});

// Rota para desconectar
app.post('/logout', async (req, res) => {
  if (exportInfo.client) {
    await exportInfo.client.destroy();
    exportInfo.client = '';
    exportInfo.conectado = false;
    exportInfo.isInicializacao = false;
    exportInfo.qrCodeBase64 = ''

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
  if (!exportInfo.client) {
    exportInfo.isSpinner = true;
    await whatsapp.criarCliente(); // Cria novo client após desconectar

    console.log('Sessão iniciada.');
  }
  res.redirect('/');
});

app.listen(port, () => {
  console.log(`🟢 Servidor rodando em: http://localhost:${port}`);
});
