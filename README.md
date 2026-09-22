# Foco

Um MVP web para reduzir a fricção de decidir e começar. Ele não mede produtividade: ajuda a encontrar um próximo passo pequeno, guardar coisas da cabeça, ler em partes e refletir sobre o dia.

## Rodar localmente

Requer Node.js 22 ou superior.

```bash
npm install
Copy-Item .env.example .env
```

Abra `.env` e preencha a chave criada no Google AI Studio:

```env
GEMINI_API_KEY=sua_chave_aqui
GEMINI_MODEL=gemini-3.8-flash
GEMINI_DAY_FALLBACK_MODEL=gemini-3.5-flash-lite
GEMINI_CHAT_MODEL=gemini-3.5-flash-lite
GEMINI_CHAT_THINKING_LEVEL=MINIMAL
PORT=3000
```

Depois execute:

```bash
npm start
```

Abra [http://localhost:3000](http://localhost:3000). Sem chave, os recursos locais continuam disponíveis; as ações que usam IA mostram uma mensagem de configuração.

## Publicar no Vercel

O projeto funciona como uma aplicação Express no Vercel. Importe o repositório no painel do Vercel e adicione estas variáveis em **Project Settings → Environment Variables** para Production e Preview:

```text
GEMINI_API_KEY=sua_chave
GEMINI_MODEL=gemini-3.8-flash
GEMINI_DAY_FALLBACK_MODEL=gemini-3.5-flash-lite
GEMINI_CHAT_MODEL=gemini-3.5-flash-lite
GEMINI_CHAT_THINKING_LEVEL=MINIMAL
```

Não envie o arquivo `.env` para o GitHub. Depois do deploy, abra a URL HTTPS no celular e use “Instalar app” ou “Adicionar à tela inicial”.

## Estrutura

```text
public/             interface HTML, CSS e JavaScript do navegador
services/           prompts e integração Gemini, somente no servidor
server.js           API Express e arquivos estáticos
test/               testes pequenos da lógica sem interface
```

## API

| Método | Rota | Uso |
| --- | --- | --- |
| GET | `/api/health` | Estado do servidor e da configuração de IA |
| POST | `/api/analyze-day` | Analisa `{ "entry": "..." }` |
| POST | `/api/chat` | Responde a `{ "message": "...", "history": [], "things": [] }` |
| POST | `/api/explain` | Explica `{ "text": "..." }` |

As rotas validam o tamanho das entradas e nunca enviam a chave ao navegador. O backend não registra diário, chat ou chave em logs.

## O que está pronto

- Ciclo “Estou travado”: energia, tempo, preferência opcional, uma microação local compatível e redução para um começo ainda menor.
- Sessão de foco opcional, com pausa, conclusão, ponto de parada, próximo passo e feedback discreto.
- Memória externa em localStorage versionado: retoma sessões após fechar/recarregar, guarda ponto de parada e próximo passo enquanto a sessão está aberta, mostra histórico de até oito começos em cada coisa, além de energia/duração preferidas, intenção de amanhã e Brain Dump com revisão antes de salvar.
- Gamificação gentil opcional: XP por começos, retomadas, sessões encerradas, pontos de parada, sessões de leitura e reflexões guardadas; constelação filtrável por mês/semana; estrelas selecionáveis; conquistas positivas desbloqueadas por ações reais; aura cosmética e opcional no símbolo oficial a partir de marcos de XP. Sem streaks, ranking ou perda por ausência.
- Minhas coisas com estado (incluindo Em andamento), próximo passo e persistência local. A IA classifica itens confirmados como leitura, jogo, filme/série ou geral; livros guardam registros de página e anotações locais em um histórico, e jogos guardam onde você parou.
- Leitura vinculada aos livros em Minhas coisas: trecho salvo por livro, sessão curta, voz do navegador e explicação opcional por IA.
- PWA instalável: com HTTPS, o navegador permite adicionar o Foco à tela inicial do celular. A logo oficial do projeto é usada no cabeçalho e ícones PWA.
- Meu dia com rascunho e histórico local, além de análise estruturada opcional por Gemini.
- Assistente IA curto, com histórico local limitado.
- Tema claro/escuro, navegação acessível, foco visível, navegação inferior no celular e redução de animação quando o sistema pede.

## Privacidade e limites atuais

Dados locais ficam no `localStorage` deste navegador. Diário só é enviado ao Gemini depois de clicar em “Analisar meu dia”; explicação envia apenas o trecho atual; o chat envia a mensagem, até quatro mensagens anteriores e até 25 coisas ativas para que possa sugerir algo relevante. Uma coisa nova só é salva após confirmação. Por padrão, o chat usa `gemini-3.5-flash-lite` com raciocínio mínimo para responder mais rápido. Se o modelo principal do diário estiver temporariamente indisponível, ele tenta `GEMINI_DAY_FALLBACK_MODEL` automaticamente. Você pode usar o modelo principal no chat definindo `GEMINI_CHAT_MODEL=gemini-3.8-flash` e `GEMINI_CHAT_THINKING_LEVEL=LOW`, caso prefira respostas mais elaboradas. O SDK instalado é `@google/genai` 2.23.0 e a chamada `models.generateContent` usada aqui não expõe `store: false`; por isso o app não afirma essa configuração. Consulte os termos e controles de dados da Gemini antes de usar textos sensíveis.

Ainda não há autenticação, banco de dados, sincronização, exportação, edição de itens/entradas ou uma integração de voz conversacional. Próximos passos úteis são adicionar testes de API com uma IA simulada, uma camada de banco/autenticação e uma API de sugestão reutilizável para o futuro mobile.
