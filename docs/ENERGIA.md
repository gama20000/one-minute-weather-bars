# Energia: análise, medições e compromissos

## Como o Pebble Time 2 gasta energia numa watchface
- **Ecrã:** e-paper / LCD de memória por píxel de 64 cores. Mantém a imagem com consumo muito baixo (menos de 15 µW para uma imagem estática, valor do fabricante para o ecrã do Pebble original). O custo está em **alterar** a imagem, não em mantê-la.
- **Cada redesenho** acorda o processador, corre o código de desenho e transfere a imagem para o ecrã. Segundo a rePebble, uma watchface que redesenha uma vez por minuto gasta pouco; o que faz descer a bateria "várias vezes mais depressa" são os segundos e as animações.
- **Outros consumos** relevantes, segundo o guia de programação da rePebble: o tempo que a app mantém o relógio acordado, o Bluetooth frequente (deixa a ligação num estado de maior consumo), a luz de fundo (a mais cara) e a vibração.
- **O SDK não redesenha só uma parte do ecrã:** em cada atualização, todas as camadas da janela são desenhadas outra vez. Por isso, "redesenhar apenas as regiões necessárias" foi feito com uma **cache**, e não com camadas.

## O que a watchface faz (por separado)
| Tarefa | Quando | Mecanismo |
|---|---|---|
| Hora e ponteiro | De dia: 1 / 2,5 / 5 min. À noite: 5 / 15 / 30 min | 1 min: `tick_timer_service` (`MINUTE_UNIT`), alinhado pelo sistema. Acima de 1 min: sem subscrição de minutos e **um único** `AppTimer` de disparo único até ao próximo limite do intervalo (alinhado à meia-noite) ou à próxima mudança dia/noite |
| Desenho da meteorologia, calendário e indicadores | Só quando muda o que mostram | Imagem guardada em memória (45,6 KB), copiada em cada atualização |
| Download da previsão | Pelo seu próprio intervalo (30 min a 3 h) | Verificado em cada acordar e ao religar; espera progressiva entre tentativas falhadas. Não há pedidos se a meteorologia nunca for mostrada |
| Data e calendário | À meia-noite | Todos os intervalos dividem 24 h, por isso há sempre um acordar às 00:00 |
| Toque no pulso | Só se estiver ativo | Deteção de toque do acelerómetro (o sensor já funciona para os passos); cada toque atualiza o mostrador |

Não há temporizadores permanentes nem processos em segundo plano. Há no máximo um temporizador pendente.

## Medições feitas (emulador emery, QEMU)
Os tempos do emulador **não** são os do relógio real. Servem só para comparar modos entre si.

| Medição | Resultado |
|---|---|
| Redesenho completo (meteorologia + relógio) | 9–28 ms |
| Redesenho com cache (só marcações, hora e ponteiro) | 4–9 ms |
| Ritmo de dia (1 min) | 1 redesenho por minuto (registo: 22:59, 23:00) |
| Ritmo de noite (5 min, teste acelerado) | nenhum redesenho entre 23:01 e 23:04; o seguinte às 23:05 |
| Resultado visual da cache | igual pixel a pixel ao desenho completo |

### Redesenhos por dia (contagem, não consumo)
Com o dia das 07:00 às 23:00 (16 h) e a noite das 23:00 às 07:00 (8 h):

| Configuração | Redesenhos/dia |
|---|---|
| Sempre 1 min (como a One Minute Hand) | 1440 |
| Dia 1 min + noite 15 min (predefinição) | 960 + 32 = 992 (−31 %) |
| Dia 2,5 min + noite 30 min | 384 + 16 = 400 (−72 %) |
| Dia 5 min + noite 30 min | 192 + 16 = 208 (−86 %) |

**Isto não é uma estimativa de autonomia.** A proporção de bateria gasta em redesenhos, comparada com o Bluetooth, os sensores de saúde, as notificações e a luz de fundo, não foi medida. Uma watchface que redesenha de minuto a minuto já está no grupo das que gastam pouco. Por isso, menos 31 % de redesenhos pode corresponder a uma poupança total pequena.

## Como medir no relógio real
1. Usar 2–3 dias com a configuração A e outros 2–3 dias com a configuração B, com uso semelhante (notificações, luz de fundo).
2. Comparar na aplicação Pebble a secção **Bateria** (definições do relógio), que mostra o consumo ao longo do tempo.
3. Como referência, a rePebble recomenda testar com a watchface TikTok, que atualiza uma vez por minuto sem animações.

## Compromissos
- **Precisão:** com intervalos acima de 1 minuto, o minuto mostrado pode estar atrasado até ao intervalo escolhido. Por exemplo, às 23:14 com 15 min ainda aparece 23:00. A página de definições avisa disto. Com o toque no pulso ativo, cada toque atualiza o mostrador.
- **Memória:** a cache ocupa 45,6 KB dos cerca de 117 KB livres. Se não houver memória, a watchface desenha tudo a cada atualização, sem falhar.
- **Meteorologia:** é independente do ritmo do mostrador. Os novos dados aparecem logo que chegam, porque a chegada força um redesenho.
