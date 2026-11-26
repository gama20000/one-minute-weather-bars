# Comunicação telemóvel → relógio

## Previsão (`wx`, byte array, little-endian, ≤ 256 bytes)

| Offset | Tipo | Campo |
|---|---|---|
| 0 | u8 | versão (= 1) |
| 1 | u8 | número de dias N (≤ 8) |
| 2 | u8 | unidade (0 °C, 1 °F) |
| 3 | u8 | número de horas H (= 73) |
| 4 | u32 | hora da transferência (UTC epoch) |
| 8 | u32 | 00:00 do dia 0 no fuso da localização (UTC epoch) |
| 12 | u32 | data do dia 0 na localização, AAAAMMDD |
| 16 | i32 | `utc_offset_seconds` da localização |
| 20 | 8 × N | por dia: i16 máx, i16 mín (`INT16_MIN` = sem dados), u8 prob. (255 = sem dados), u8 ícone, u16 mm×10 (0xFFFF = sem dados) |
| 20+8N | u16 × H | precipitação horária ×10 da hora que termina em dia0 + i h |

Total com 8 dias: 230 bytes. É guardado tal como chega (`persist`), portanto sobrevive a reinícios.

## Significado dos dados (Open-Meteo)

- **%** = `precipitation_probability_max`: a maior probabilidade horária de chover mais de 0,1 mm nesse dia. **Não** é a probabilidade de chover "em algum momento" do dia.
- **mm (total do dia)** = `precipitation_sum`: soma prevista de chuva, aguaceiros e neve.
- **mm (resto do dia)** = soma da precipitação horária prevista desde a hora atual (contada inteira) até às 24:00 da localização. É calculada no relógio a cada minuto, a partir do último download.
- **Ícone** = `weather_code` diário (a condição mais severa do dia, código WMO).
- O fuso é o da localização (`timezone=auto`). Tal como na Open-Meteo, a mudança de hora (DST) dentro do período da previsão é ignorada.

## Regra de datas

O bloco **HOJE** é o dia da previsão cuja data, na localização meteorológica, é igual à data local do relógio. À meia-noite do relógio os blocos avançam um dia sem novo download. Os 2 dias extra da previsão permitem isto. Dias fora do intervalo descarregado mostram `--`.

## Estados (`status`, u8)

0 OK · 1 localização indisponível (permissão recusada, GPS) · 2 sem rede / timeout · 3 localidade não encontrada · 4 erro da API / resposta inválida.

## Pedidos do relógio (`cmd` = 1)

O relógio pede uma nova previsão quando o intervalo configurado passou. Depois de um pedido sem resposta, espera 5, 10, 20… minutos (no máximo o intervalo) antes de voltar a pedir. Só pede com o telemóvel ligado e quando a meteorologia pode aparecer no mostrador (definições, horário sem meteorologia e toque no pulso).

Se a mensagem nem chega ao telemóvel (o JS ainda está a arrancar, ou a ligação falha), só a primeira falha é repetida logo na ativação seguinte. As falhas seguintes respeitam a mesma espera progressiva.

## Telemóvel pronto (`cmd` = 2, telemóvel → relógio)

O telemóvel nunca descarrega a previsão por iniciativa própria. Quando o JS arranca:

- se houver definições por entregar, envia-as primeiro. O relógio volta a verificar a previsão quando as recebe;
- caso contrário, envia `cmd` = 2 apenas se a última previsão entregue for mais antiga do que o intervalo configurado. Um regresso rápido de uma app não custa nenhuma mensagem Bluetooth;
- com a meteorologia totalmente desligada, não envia nada.

O relógio responde com `cmd` = 1 apenas se precisar de uma previsão nova.

## Previsão obsoleta (`cmd` = 3, telemóvel → relógio, junto com as definições)

Ao guardar as definições, o telemóvel não descarrega nada. Se mudarem as unidades, a fonte ou a localização, ou se a meteorologia for ligada, as definições seguem com `cmd` = 3. O relógio considera a previsão vencida e anula a espera entre tentativas. Essa marca fica gravada, por isso sobrevive a um reinício do mostrador. Pede logo que a meteorologia possa aparecer, respeitando o horário e o toque no pulso. A previsão antiga continua no mostrador até chegar a nova.

As definições ficam pendentes no telemóvel até o relógio confirmar a receção. Se o envio falhar, o telemóvel tenta outra vez uma única vez, passado um minuto. Depois disso, só volta a tentar a cada mensagem do relógio, a cada gravação das definições e quando o JS arranca. Envia-as sempre antes de uma previsão, para que o relógio nunca receba, por exemplo, uma previsão em °F com as definições em °C. Se não as conseguir entregar, retém a previsão.

Uma previsão que não seja mais recente do que a guardada (por exemplo, a mesma previsão vencida da app Pebble) não reinicia a espera entre tentativas do relógio, e também não é gravada de novo se for igual.

Se as definições relevantes mudarem durante um pedido, incluindo a espera pela entrega das definições, o telemóvel descarta esse resultado e faz um único pedido novo, se a meteorologia ainda for precisa. Um estado (`status`) igual ao anterior não é gravado de novo nem redesenha o mostrador.

## Fontes da previsão (definição `wx_source`, só no telemóvel)

- **App Pebble (0, predefinida).** Usa a previsão que a app Pebble 2.0+ já mantém, através de `Pebble.subscribeToSource({ category: 'weather', item: 'location' })`. Cada pedido do relógio abre a subscrição, lê o primeiro envelope e cancela-a logo. O telemóvel não usa o GPS nem faz downloads próprios. A localização é a primeira da app Pebble.
  - Máxima, mínima, probabilidade e ícone vêm das séries diárias `daily_high`, `daily_low`, `daily_precipitation` e `daily_condition_code`. A temperatura é convertida para a unidade escolhida.
  - Os mm do dia são a soma das 24 horas de `hourly_precipitation_amount`, quando existem todas. Sem esses dados, ficam "sem dados" (`--`). A documentação da Pebble só promete esta série para a versão seguinte da app.
  - Pressuposto a confirmar num dispositivo: cada valor horário cobre a hora que **começa** no seu instante.
  - A previsão conta como recente enquanto `validUntilMs` não passar. Depois disso, mantém a idade.
  - Ícones: `sun` sol, `partly_cloudy` parcial, `cloudy` nuvens, `light_rain` chuvisco, `heavy_rain` chuva, `light_snow`/`heavy_snow`/`rain_and_snow` neve, `unknown` nenhum. Não há nevoeiro nem trovoada.
  - Se a app for anterior à 2.0, ou recusar a fonte (`PLUGIN_UNAVAILABLE`, `PERMISSION_DENIED`, `INVALID_REQUEST`), é usada a Open-Meteo até voltar a guardar as definições. `TIMEOUT`, `RATE_LIMITED` e `UNKNOWN` são enviados ao relógio como erro de rede. Sem localização na app Pebble, o estado é "localização indisponível".
- **Open-Meteo (1).** Localização do telemóvel (GPS ou nome) e download próprio, como descrito acima. Fornece totais em mm para todos os dias.
