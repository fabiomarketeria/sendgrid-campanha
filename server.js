const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const sgMail = require('@sendgrid/mail');
const path = require('path');
sgMail.setApiKey(process.env.SENDGRID_API_KEY || 'SUA_SENDGRID_API_KEY');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.static('public'));

let contacts = []; // Simulação de banco
let sequences = []; // Simulação de banco

// Importar contatos via CSV
app.post('/import-contacts', upload.single('file'), (req, res) => {
  const results = [];
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (data) => {
      results.push({
        name: data.name || data.nome,
        email: data.email,
        tags: (data.tags || '').split(',').map(t => t.trim())
      });
    })
    .on('end', () => {
      contacts = contacts.concat(results);
      fs.unlinkSync(req.file.path);
      res.json({ success: true, imported: results.length });
    });
});

// Listar contatos por tag
app.get('/contacts', (req, res) => {
  const tag = req.query.tag;
  if (tag) {
    res.json(contacts.filter(c => c.tags.includes(tag)));
  } else {
    res.json(contacts);
  }
});

// Criar sequência de emails
app.post('/sequence', (req, res) => {
  const { name, emails } = req.body;
  const id = Date.now().toString();
  sequences.push({ id, name, emails });
  res.json({ success: true, sequence: { id, name, emails } });
});

// Listar sequências
app.get('/sequences', (req, res) => {
  res.json(sequences);
});

// Disparar sequência para todos os contatos de uma tag
app.post('/send-sequence', async (req, res) => {
  const { tag, sequenceId } = req.body;
  const seq = sequences.find(s => s.id === sequenceId);
  if (!seq) return res.status(400).json({ error: 'Sequência não encontrada' });
  const contatos = contacts.filter(c => c.tags.includes(tag));
  let enviados = 0, erros = [];
  for (const contato of contatos) {
    for (const step of seq.emails) {
      try {
        await sgMail.send({
          to: contato.email,
          from: process.env.SENDGRID_EMAIL || 'SEU_EMAIL_SENDGRID',
          subject: step.subject,
          text: step.body.replace('{name}', contato.name)
        });
        enviados++;
      } catch (err) {
        erros.push({ email: contato.email, erro: err.message });
      }
    }
  }
  res.json({ total: contatos.length, enviados, erros });
});

// Frontend simples
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(3000, () => console.log('Servidor rodando em http://localhost:3000'));