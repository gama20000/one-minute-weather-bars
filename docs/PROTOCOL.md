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

O relógio pede uma nova previsão quando o intervalo configurado passou. Depois de um pedido sem resposta, espera 5, 10, 20… minutos (no máximo o intervalo) antes de voltar a pedir. Só pede com o telemóvel ligado.
