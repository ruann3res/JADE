# Roteiro do Video de Demonstracao da Extensao JADE

## Objetivo do video

O video deve apresentar a extensao JADE em uma demonstracao de tres a cinco minutos, mostrando seu uso pratico, suas principais contribuicoes, seus objetivos, usuarios em potencial, caracteristicas centrais e resultados obtidos.

A ideia principal e mostrar que a JADE auxilia desenvolvedores Java na identificacao, analise, comparacao e correcao de problemas de codigo usando IA local via Ollama, apoio de RAG, relatorios, feedback e comparacao entre modelos.

## Estrutura sugerida

Duracao ideal: aproximadamente 4 minutos.

- 0:00 a 0:25: introducao.
- 0:25 a 0:55: visao geral da ferramenta.
- 0:55 a 1:35: setup e configuracao.
- 1:35 a 2:10: analise de arquivo Java.
- 2:10 a 2:50: coleta de feedback sobre sugestoes.
- 2:50 a 3:15: geracao de correcao com IA.
- 3:15 a 3:45: feedback geral e comparacao cientifica entre modelos.
- 3:45 a 4:20: resultados e contribuicoes.
- 4:20 a 4:40: encerramento.

## 0:00 - 0:25 | Introducao

Tela sugerida: VS Code aberto com um projeto Java.

Narracao sugerida:

> Este video apresenta a JADE, uma extensao para Visual Studio Code voltada a analise e reparo de codigo Java com apoio de modelos de linguagem.
> A ferramenta tem como objetivo auxiliar desenvolvedores, pesquisadores e equipes de qualidade de software na identificacao de problemas, geracao de sugestoes e melhoria continua da analise assistida por IA por meio de feedback estruturado do usuario.

Mostrar rapidamente:

- VS Code aberto.
- Projeto Java carregado.
- Menu de comandos da extensao JADE.
- Painel **JADE — Report and feedback** (se ja houver analise previa).

## 0:25 - 0:55 | Visao geral da ferramenta

Tela sugerida: abrir a paleta de comandos do VS Code e pesquisar por `JADE`.

Comandos para destacar:

- `JADE: Setup`
- `JADE: Select Ollama model`
- `JADE: Analyze File`
- `JADE: Generate Fix with AI`
- `JADE: Run Model Comparison`
- `JADE: Compare Models on Open Java File`
- `JADE: Open Latest AI Report`
- `JADE: Open Latest Model Comparison Report`
- `JADE: Export Feedback`

Narracao sugerida:

> A JADE integra analise estatica, modelos locais via Ollama, contexto recuperado por RAG, relatorios visuais e um ciclo de feedback dentro do proprio VS Code. Atualmente, a extensao suporta oficialmente **Deepseek-Coder (6.7B)** e **Qwen2.5-Coder (7B)** via Ollama.
> Entre seus usuarios em potencial estao desenvolvedores Java, professores, estudantes, pesquisadores em engenharia de software e equipes que desejam avaliar e refinar modelos de IA aplicados a qualidade de codigo.
> Como sugestoes de IA nem sempre sao perfeitas, a JADE foi pensada para capturar o julgamento humano sobre cada achado — nao apenas para documentar resultados, mas para orientar a melhoria iterativa da ferramenta.

## 0:55 - 1:35 | Setup e configuracao

Tela sugerida: executar ou mostrar o comando `JADE: Setup`.

Narracao sugerida:

> O unico requisito para usar a JADE e o **Ollama** rodando localmente com um dos modelos suportados atualmente: **Deepseek-Coder** (`deepseek-coder:6.7b`) ou **Qwen2.5-Coder** (`qwen2.5-coder:7b`). O modelo ativo pode ser trocado a qualquer momento com **JADE: Select Ollama model**.
> Sem Docker, sem conta Sonar e sem servicos extras, a analise ja funciona com heuristicas **built-in** embutidas na extensao.
> Opcionalmente, **JADE: Setup** usa **Docker** para subir o **Qdrant** e conecta ao **SonarCloud** para ingerir regras customizadas da sua organizacao como contexto vetorial. Se o setup nao for feito ou o Qdrant falhar, a JADE volta automaticamente para as heuristicas built-in.

Mostrar:

- Ollama em execucao.
- Comando `JADE: Select Ollama model` (Deepseek ou Qwen).
- Modelo ativo.
- Output da JADE indicando configuracao ou setup.

Observacao: esta parte deve ser curta. O foco e mostrar que existe configuracao e que o modelo e local e configuravel.

## 1:35 - 2:10 | Analise de arquivo Java

Tela sugerida: abrir um arquivo Java com problemas.

Acao: executar `JADE: Analyze File`.

Narracao sugerida:

> Agora executamos a analise de um arquivo Java. A extensao envia o codigo para o modelo de IA em lotes, aplica contexto adicional via RAG e transforma as respostas em sugestoes estruturadas.
> Os resultados aparecem como diagnosticos no editor e tambem no painel **Report and feedback**, onde cada sugestao pode ser revisada em detalhe.

Mostrar:

- Arquivo Java com problemas.
- Comando `JADE: Analyze File`.
- Problemas aparecendo no editor.
- Painel de relatorio aberto ao lado do codigo.

Destaques:

- Sugestoes estruturadas.
- Linha do problema.
- Categoria do problema.
- Explicacao da IA.
- Execucao em batches.

## 2:10 - 2:50 | Coleta de feedback sobre sugestoes

Tela sugerida: painel **JADE — Report and feedback** com sugestoes visiveis.

Acao: preencher e salvar feedback em pelo menos uma sugestao.

Narracao sugerida:

> Apos a analise, o desenvolvedor revisa cada sugestao no painel de relatorio.
> Para cada achado, a JADE permite atribuir uma nota, escolher um veredito — issue valida, falso positivo, parcialmente valida ou incerta — selecionar um motivo como util, linha errada, contexto ausente ou muito generica, e adicionar um comentario opcional.
> Ao clicar em **Save feedback**, o registro e salvo em `jade-feedback.json` no workspace, vinculado ao modelo, versao do prompt, arquivo, linha e conteudo da sugestao.
> Esse feedback estruturado e essencial: indica quais sugestoes sao confiaveis, quais sao ruido e onde a ferramenta ainda precisa melhorar — em prompts, contexto RAG ou geracao de correcoes.

Mostrar:

- Estrelas de avaliacao (1 a 5).
- Campo **Verdict** (valid, false positive, partially valid, unclear).
- Campo **Reason** (useful, wrong line, missing context, too generic, wrong fix, etc.).
- Campo de comentario.
- Botao **Save feedback**.
- Notificacao `Feedback saved to jade-feedback.json`.
- Arquivo `jade-feedback.json` no explorador do workspace.

Mensagem importante:

> Cada sessao de uso pode alimentar a evolucao da ferramenta: quanto mais feedback estruturado coletamos, melhor conseguimos priorizar ajustes e reduzir falsos positivos.

## 2:50 - 3:15 | Geracao de correcao com IA

Tela sugerida: selecionar um diagnostico no editor e executar uma acao de correcao.

Acao: usar o quick fix ou executar `JADE: Generate Fix with AI`.

Narracao sugerida:

> Alem de detectar problemas, a JADE tambem pode solicitar ao modelo uma correcao segura.
> A extensao nao aplica qualquer texto livre diretamente: ela espera uma resposta estruturada, valida o patch gerado e so entao aplica a alteracao no editor.

Mostrar:

- Diagnostico selecionado.
- Acao de gerar correcao.
- Patch aplicado ou rejeitado.
- Painel de execucao mostrando:
  - diagnostico original;
  - fix gerado;
  - validacao;
  - status final.

Mensagem importante:

> Esse processo aumenta a rastreabilidade e reduz o risco de aplicar alteracoes invalidas ou inseguras.
> Se a correcao for inadequada, isso tambem pode ser registrado no relatorio — por exemplo com o motivo **wrong fix** — para que versoes futuras aprendam com o uso real.

## 3:15 - 3:45 | Feedback geral e comparacao cientifica entre modelos

Tela sugerida: executar `JADE: Export Feedback` e, em seguida, abrir um relatorio de comparacao ja gerado.

Narracao sugerida:

> Alem do feedback por sugestao, o usuario pode compartilhar a experiencia geral com a extensao pelo comando **JADE: Export Feedback**, que abre um formulario externo.
> Para fins cientificos, a JADE inclui um modulo de comparacao entre **Deepseek** e **Qwen** — os dois modelos suportados atualmente. Ele executa os mesmos exemplos em ambos, registra tempo de resposta, quantidade de sugestoes, falsos positivos e metricas como precisao, recall e F1 quando ha ground truth disponivel.
> Juntos, o feedback por sugestao e os resultados do benchmark formam a base de evidencias que usamos para priorizar melhorias e decidir qual modelo performa melhor em cada tarefa.

Mostrar:

- Comando `JADE: Export Feedback` (formulario aberto no navegador).
- Comando de comparacao ou relatorio ja gerado.
- Painel de comparacao.
- Ranking dos modelos.
- Metricas principais (tempo, sugestoes validas, falsos positivos, precision, recall, F1).

Ponto academico forte:

> Isso permite avaliar empiricamente o comportamento dos modelos e cruzar esses dados com o feedback humano coletado durante o uso real da ferramenta.

## 3:45 - 4:20 | Resultados e contribuicoes

Tela sugerida: mostrar rapidamente os relatorios salvos no workspace.

Narracao sugerida:

> Como resultado, a JADE oferece uma experiencia integrada para analise, correcao, avaliacao e melhoria continua do uso de IA em codigo Java.
> Suas principais contribuicoes sao: integracao com modelos locais, analise assistida por RAG, geracao segura de correcoes, **feedback estruturado do usuario em cada sugestao**, relatorios rastreaveis, exportacao para feedback geral e comparacao cientifica entre modelos.
> O arquivo de feedback e os relatorios de comparacao fornecem dados acionaveis para refinar prompts, reduzir falsos positivos e tornar a ferramenta mais confiavel ao longo do tempo.

Mostrar:

- Arquivo `jade-feedback.json` com registros salvos.
- Pasta `jade-ai-reports/`.
- Pasta `model-comparison-results/`.
- Arquivos `latest.json`.
- CSV da comparacao de modelos.

## 4:20 - 4:40 | Encerramento

Tela sugerida: voltar para o VS Code com o painel de relatorio aberto.

Narracao sugerida:

> Portanto, a JADE nao e apenas uma ferramenta pratica de apoio ao desenvolvimento, mas um sistema em evolucao que aprende com a contribuicao dos usuarios.
> A extensao concentra o fluxo completo dentro do VS Code: analisar, explicar, revisar, dar feedback, corrigir, comparar modelos e registrar resultados — para que cada sessao ajude a melhorar a proxima.

## Checklist antes de gravar

- Abrir um projeto Java no VS Code.
- Preparar um arquivo Java com problemas visiveis.
- Garantir que o Ollama esteja rodando.
- Garantir que os modelos estejam instalados.
- Ter um relatorio de comparacao ja gerado para evitar espera durante a gravacao.
- Ter pelo menos um registro salvo em `jade-feedback.json` (ou preparar para salvar ao vivo).
- Compilar a extensao e executar no VS Code Extension Host.
- Deixar prontos os paineis `AI Report` e `Model Comparison Report`.
- Testar **Save feedback** e `JADE: Export Feedback` antes de iniciar a gravacao.
- Testar os comandos principais antes de iniciar a gravacao.

## Frase de resumo

> A JADE e uma extensao para VS Code que utiliza modelos locais — atualmente **Deepseek-Coder** e **Qwen2.5-Coder** via Ollama — para apoiar analise e reparo de codigo Java, fornecendo diagnosticos, sugestoes, correcoes seguras, coleta estruturada de feedback e comparacao cientifica entre esses modelos para melhorar continuamente a ferramenta.

