#!/usr/bin/env tsx

import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";

// Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const STATEMENTS_FOLDER = path.join(process.cwd(), "statements");
const OUTPUT_FOLDER = path.join(STATEMENTS_FOLDER, "extracted");
const CONCURRENCY_LIMIT = 50;
const MODEL = "gpt-4o";
const PROMPT = `Read this bank statement and extract all the transactions into a csv table i can copy paste into a spreadsheet. no mermaid markdown, no markdown tables, no markdown lists, no markdown code blocks, no markdown anything else. just comma separated values. make sure the date field is in the correct format YYYY-MM-DD. make sure the amount number is always positive and doesn't use commas or any other characters. the direction of the transaction is determined by the words 'credit' or 'debit'. make sure you reply only with the table and nothing else. Use this header: date account description amount category type(credit/debit)
for the transaction category you need to classify it based on the available categorties:
Categories Available: ATM Withdrawal
Auto & Transport
Capital Gain Income
Credit Card Payment
Entertainment
Fees
Food & Drink
General Services
Health & Personal Care
Home Improvement
Investment
Other Expenses
Other Income
Personal Care
Rent & Utilities
Salary
Shopping
Subscriptions
Taxes
Travel. 

Use this sample data as reference

2024-01-01        Citi PremierMiles        WECHAT*TENCENT ShenZhen CN        55.45                        Shopping        debit
2024-01-01        Citi PremierMiles        WECHAT*TENCENT ShenZhen CN        23.84                        Shopping        debit
2024-01-01        Citi PremierMiles        Netflix.com Los Gatos NL        19.66                        Subscriptions        debit
2024-01-02        Citi PremierMiles        WEIXIN*Donghuang Seafo Shenzhen CN        101.39                        Shopping        debit
2024-01-02        Citi PremierMiles        WECHAT*TENCENT ShenZhen CN        2.3                        Shopping        debit
2024-01-02        Citi PremierMiles        WECHAT*TENCENT ShenZhen CN        1.54                        Shopping        debit
2024-01-03        Citi PremierMiles        ALIPAY BEIJING CN        346.81                        Shopping        debit
2024-01-03        Citi PremierMiles        WECHAT*TENCENT ShenZhen CN        13.08                        Shopping        debit
2024-01-04        Citi PremierMiles        fp*Food Panda Singapore SG        42.49                        Food & Drink        debit
2024-01-04        Citi PremierMiles        Grab* A-5SFCSA2WWIIE Singapore SG        29.5                        Auto & Transport        debit
2024-01-04        Citi PremierMiles        WECHAT*TENCENT ShenZhen CN        0.58                        Shopping        debit
2024-01-05        Citi PremierMiles        COLD STORAGE-MARINA ONE SINGAPORE SG        91.65                        Food & Drink        debit
2024-01-05        Citi PremierMiles        CIRCLES.LIFE SINGAPORE SG        52.06                        Rent & Utilities        debit
2024-01-06        Citi PremierMiles        OMMA KOREAN CHARCOAL BBQ SINGAPORE SG        145.08                        Food & Drink        debit
2024-01-06        Citi PremierMiles        BUS/MRT 371384619 SINGAPORE SG        1.67                        Auto & Transport        debit
2024-01-07        Citi PremierMiles        IKEA SINGAPORE SG        89                        Shopping        debit
2024-01-07        Citi PremierMiles        IKEA - RESTAURANT SINGAPORE SG        41.5                        Food & Drink        debit
2024-01-07        Citi PremierMiles        Grab* A-5ST3LWJGWIRB Singapore SG        13.7                        Auto & Transport        debit
2024-01-07        Citi PremierMiles        Grab* A-5STQH6GWWJQ7 Singapore SG        13.1                        Auto & Transport        debit
2024-01-08        Citi PremierMiles        OPENAI HTTPSOPENAI.CUS        3.86                        Shopping        debit
2024-01-10        Citi PremierMiles        AUSTRALIANETA NORTH SYDNEY AU        18.47                        Travel        debit
2024-01-11        Citi PremierMiles        COLD STORAGE-MARINA ONE SINGAPORE SG        46.4                        Food & Drink        debit
2024-01-13        Citi PremierMiles        Lazada Singapore SG        51.42                        Shopping        debit
2024-01-13        Citi PremierMiles        fp*Food Panda Singapore SG        42.19                        Food & Drink        debit
2024-01-14        Citi PremierMiles        APPLE.COM/BILL ITUNES.COM IE        13.98                        Subscriptions        debit
2024-01-14        Citi PremierMiles        CHICHA SAN CHEN - MARINA SINGAPORE SG        11.6                        Food & Drink        debit
2024-01-14        Citi PremierMiles        MCDONALD'S (MC) SINGAPORE SG        2.95                        Food & Drink        debit
2024-01-14        Citi PremierMiles        BUS/MRT 375229307 SINGAPORE SG        2.18                        Auto & Transport        debit
2024-01-15        Citi PremierMiles        INTEX.SG SINGAPORE SG        259.9                        Shopping        debit
2024-01-15        Citi PremierMiles        COLD STORAGE-MARINA ONE SINGAPORE SG        20.3                        Food & Drink        debit
2024-01-15        Citi PremierMiles        CCY CONVERSION FEE        0.13                        Fees        debit
2024-01-16        Citi PremierMiles        GARDENS BY THE BAY SINGAPORE SG        96                        Entertainment        debit
2024-01-16        Citi PremierMiles        GARDENS BY THE BAY SINGAPORE SG        40                        Entertainment        debit
2024-01-17        Citi PremierMiles        DELIVEROO SINGAPORE SG        55.61                        Food & Drink        debit
2024-01-18        Citi PremierMiles        fp*Food Panda Singapore SG        48.39                        Food & Drink        debit
2024-01-18        Citi PremierMiles        Grab* A-5U9UTPQWWI8W Singapore SG        18                        Auto & Transport        debit
2024-01-18        Citi PremierMiles        Grab* A-5UA5FSIGWF67 Singapore SG        9.6                        Auto & Transport        debit
2024-01-19        Citi PremierMiles        SP Digital PL-Utilitie SINGAPORE SG        130.92                        Rent & Utilities        debit
2024-01-19        Citi PremierMiles        Grab* A-5UE9TX5GWJ5A Singapore SG        11.5                        Auto & Transport        debit
2024-01-19        Citi PremierMiles        Grab* A-5UEFTVSGWGX5 Singapore SG        10.2                        Auto & Transport        debit
2024-01-19        Citi PremierMiles        Grab* A-5UE9TX5GWJ5A Singapore SG        4.9                        Auto & Transport        debit
2024-01-19        Citi PremierMiles        BUS/MRT 377865982 SINGAPORE SG        1.09                        Auto & Transport        debit
2024-01-20        Citi PremierMiles        fp*Food Panda Singapore SG        48.94                        Food & Drink        debit
2024-01-20        Citi PremierMiles        DAISO JAPAN - 100AM SINGAPORE SG        30.52                        Shopping        debit
2024-01-20        Citi PremierMiles        JAPAN HOME Singapore SG        17                        Shopping        debit
2024-01-20        Citi PremierMiles        Grab* A-5UHREH7GWJ66 Singapore SG        11.6                        Auto & Transport        debit
2024-01-20        Citi PremierMiles        Grab* A-5UJJ34HGWHMO Singapore SG        9.2                        Auto & Transport        debit
2024-01-21        Citi PremierMiles        KIWI.COM BRNO - ZABRDOCZ        1377.38                        Travel        debit
2024-01-21        Citi PremierMiles        fp*Food Panda Singapore SG        96.49                        Food & Drink        debit
2024-01-21        Citi PremierMiles        GOOGLE*DOMAINS G.CO/HELPPAY#SG        21.8                        Shopping        debit
2024-01-22        Citi PremierMiles        Viewqwest Pte Ltd INTERNET SG        43.29                        Rent & Utilities        debit
2024-01-22        Citi PremierMiles        Grab* A-5URTWH5WWH6G Singapore SG        14.2                        Auto & Transport        debit
2024-01-22        Citi PremierMiles        CCY CONVERSION FEE        13.77                        Fees        debit
2024-01-22        Citi PremierMiles        FRUITS VENDING PTE LTD Singapore SG        2                        Food & Drink        debit
2024-01-23        Citi PremierMiles        SPOTIFY STOCKHOLM SE        14.98                        Subscriptions        debit
2024-01-23        Citi PremierMiles        Grab* A-5UTNAFQWWED2 Singapore SG        13.5                        Auto & Transport        debit
2024-01-23        Citi PremierMiles        BUS/MRT 379989759 SINGAPORE SG        1.09                        Auto & Transport        debit
2024-01-24        Citi PremierMiles        fp*Food Panda Singapore SG        34                        Food & Drink        debit
2024-01-25        Citi PremierMiles        REDMART SG PAYMENT SINGAPORE SG        285.64                        Food & Drink        debit
2024-01-25        Citi PremierMiles        LAZADA SINGAPORE SINGAPORE SG        15.34                        Shopping        debit
2024-01-25        Citi PremierMiles        TADA RIDE 144CDD SINGAPORE SG        14.32                        Auto & Transport        debit
2024-01-25        Citi PremierMiles        REDMART SG PAYMENT SINGAPORE SG        10.13                        Food & Drink        debit
2024-01-26        Citi PremierMiles        TADA RIDE 6CF7F8 SINGAPORE SG        10.14                        Auto & Transport        debit
2024-01-26        Citi PremierMiles        COMMON MAN STAN Singapore SG        9.59                        Food & Drink        debit
2024-01-27        Citi PremierMiles        SBTB STALL 6 SINGAPORE SG        22                        Food & Drink        debit
2024-01-27        Citi PremierMiles        TADA RIDE CC2DAE SINGAPORE SG        10.95                        Auto & Transport        debit
2024-01-28        Citi PremierMiles        LAZADA SINGAPORE SINGAPORE SG        152.11                        Shopping        debit
2024-01-28        Citi PremierMiles        fp*Food Panda Singapore SG        61.79                        Food & Drink        debit
2024-01-28        Citi PremierMiles        APPLE.COM/BILL ITUNES.COM IE        13.98                        Subscriptions        debit
2024-01-29        Citi PremierMiles        CCY CONVERSION FEE        0.13                        Fees        debit
2024-01-30        Citi PremierMiles        LAZADA SINGAPORE SINGAPORE SG        396                        Shopping        debit
2024-01-30        Citi PremierMiles        SP SECRETLAB SINGAPORE SG        282                        Shopping        debit
2024-01-30        Citi PremierMiles        IKEA - ONLINE SINGAPORE SG        115.2                        Shopping        debit
2024-01-30        Citi PremierMiles        TADA RIDE 05EA7E SINGAPORE SG        25.87                        Auto & Transport        debit
2024-01-31        Citi PremierMiles        Viewqwest Pte Ltd INTERNET SG        32.94                        Rent & Utilities        debit
2024-02-01        Citi PremierMiles        FAR EAST FLORA.COM PTE SINGAPORE SG        198.27                        Shopping        debit
2024-02-01        Citi PremierMiles        NETFLIX.COM 866-579-7172 NL        19.61                        Subscriptions        debit
2024-02-02        Citi PremierMiles        CIRCLES.LIFE SINGAPORE SG        29.01                        Rent & Utilities        debit
2024-02-03        Citi PremierMiles        DON DON DONKI - 100AM SINGAPORE SG XXXX-XXXX-XXXX-1381        119.12                        Food & Drink        debit
2024-02-03        Citi PremierMiles        LAZADA SINGAPORE SINGAPORE SG        46.44                        Shopping        debit
2024-02-03        Citi PremierMiles        TADA RIDE AF4618 SINGAPORE SG        29.54                        Auto & Transport        debit
2024-02-03        Citi PremierMiles        Grab* A-6WC3UJDGWFXC Singapore SG        21.7                        Auto & Transport        debit
2024-02-03        Citi PremierMiles        JAPAN HOME Singapore SG XXXX-XXXX-XXXX-1530        21.05                        Shopping        debit
2024-02-03        Citi PremierMiles        DAISO JAPAN - 100AM SINGAPORE SG XXXX-XXXX-XXXX-1381        19.4                        Shopping        debit
2024-02-03        Citi PremierMiles        LAZADA SINGAPORE SINGAPORE SG        152.11                        Other Income        credit
2024-02-04        Citi PremierMiles        AGODA.COM MUA TALA H Internet SG        3217.68                        Travel        debit
2024-02-04        Citi PremierMiles        Trip.com Singapore SG        337.2                        Travel        debit
2024-02-05        Citi PremierMiles        Hotel at Booking.com Amsterdam NL        1386.04                        Travel        debit
2024-02-05        Citi PremierMiles        CCY CONVERSION FEE SGD 1386.04        13.86                        Fees        debit
2024-02-05        Citi PremierMiles        Grab* A-6WLX8I6GWJH3 Singapore SG        3.6                        Auto & Transport        debit
2024-02-07        Citi PremierMiles        SP Digital PL-Utilitie SINGAPORE SG        574.77                        Rent & Utilities        debit
2024-02-07        Citi PremierMiles        REDMART SG PAYMENT SINGAPORE SG        105.86                        Food & Drink        debit
2024-02-07        Citi PremierMiles        OPENAI HTTPSOPENAI.CUS USD 1.67 USD 1.67        2.32                        Subscriptions        debit
2024-02-08        Citi PremierMiles        FP XTRA VIVO SINGAPORE SG XXXX-XXXX-XXXX-1530        232.07                        Food & Drink        debit
2024-02-08        Citi PremierMiles        BUS/MRT 388328891 SINGAPORE SG XXXX-XXXX-XXXX-1530        1.09                        Auto & Transport        debit
2024-02-10        Citi PremierMiles        DORSETT SINGAPORE SG SG        59.95                        Travel        debit
2024-02-10        Citi PremierMiles        TADA RIDE 51D05D SINGAPORE SG        37.39                        Auto & Transport        debit
2024-02-10        Citi PremierMiles        7-ELEVEN-16 COLLYER QUAY SINGAPORE SG XXXX-XXXX-XXXX-1530        9.6                        Food & Drink        debit
2024-02-10        Citi PremierMiles        APAC VENDINGS PTE LTD SINGAPORE SG XXXX-XXXX-XXXX-1530        2.5                        Food & Drink        debit
2024-02-10        Citi PremierMiles        FRUITS VENDING PTE LTD Singapore SG XXXX-XXXX-XXXX-1530        2                        Food & Drink        debit
2024-02-10        Citi PremierMiles        BUS/MRT 389331876 SINGAPORE SG XXXX-XXXX-XXXX-1530        1.09                        Auto & Transport        debit
2024-02-11        Citi PremierMiles        ZUI YU XUAN TEOCHEW C. Singapore SG        339.32                        Food & Drink        debit
2024-02-11        Citi PremierMiles        BUS/MRT 389724959 SINGAPORE SG XXXX-XXXX-XXXX-1381        1.19                        Auto & Transport        debit
2024-02-11        Citi PremierMiles        BUS/MRT 389702436 SINGAPORE SG XXXX-XXXX-XXXX-1530        1.09                        Auto & Transport        debit
2024-02-12        Citi PremierMiles        KOPITIAM @ LAU PA SAT Singapore SG XXXX-XXXX-XXXX-1530        15                        Food & Drink        debit
2024-02-12        Citi PremierMiles        KOPITIAM @ LAU PA SAT Singapore SG XXXX-XXXX-XXXX-1530        9.9                        Food & Drink        debit
2024-02-12        Citi PremierMiles        BUS/MRT 389983329 SINGAPORE SG XXXX-XXXX-XXXX-1530        2.28                        Auto & Transport        debit
2024-02-13        Citi PremierMiles        THE DENTAL STUDIO Singapore SG XXXX-XXXX-XXXX-1381        149.33                        Health & Personal Care        debit
2024-02-13        Citi PremierMiles        Gyushi OUE 6A Shenton WySG XXXX-XXXX-XXXX-1381        18.31                        Food & Drink        debit
2024-02-13        Citi PremierMiles        BUS/MRT 390518724 SINGAPORE SG XXXX-XXXX-XXXX-1381        2.18                        Auto & Transport        debit
2024-02-14        Citi PremierMiles        LAZADA SINGAPORE SINGAPORE SG        127.66                        Shopping        debit
2024-02-14        Citi PremierMiles        fp*Food Panda Singapore SG XXXX-XXXX-XXXX-1381        76.91                        Food & Drink        debit
2024-02-14        Citi PremierMiles        APPLE.COM/BILL ITUNES.COM IE        13.98                        Subscriptions        debit
2024-02-14        Citi PremierMiles        CCY CONVERSION FEE SGD 13.98        0.13                        Fees        debit
2024-02-16        Citi PremierMiles        S'PORE SPORTS HUB-NTNL STSINGAPORE SG XXXX-XXXX-XXXX-1381        50                        Food & Drink        debit
2024-02-16        Citi PremierMiles        S'PORE SPORTS HUB-NTNL STSINGAPORE SG XXXX-XXXX-XXXX-1381        48                        Food & Drink        debit
2024-02-16        Citi PremierMiles        TADA RIDE 0B91B0 SINGAPORE SG        26.68                        Auto & Transport        debit
2024-02-16        Citi PremierMiles        BUS/MRT 391874350 SINGAPORE SG XXXX-XXXX-XXXX-1530        1.49                        Auto & Transport        debit
2024-02-17        Citi PremierMiles        AKEMI UCHI-PS SINGAPORE SG XXXX-XXXX-XXXX-1381        39.9                        Shopping        debit
2024-02-17        Citi PremierMiles        KOPITIAM@PLAZA SINGAPURA Singapore SG XXXX-XXXX-XXXX-1381        15.3                        Food & Drink        debit
2024-02-17        Citi PremierMiles        TADA RIDE 67357A SINGAPORE SG        14.12                        Auto & Transport        debit
2024-02-17        Citi PremierMiles        IROHA MART - PLAZA SINGAPSINGAPORE SG XXXX-XXXX-XXXX-1381        7.4                        Food & Drink        debit
2024-02-17        Citi PremierMiles        KOPITIAM@PLAZA SINGAPURA Singapore SG XXXX-XXXX-XXXX-1381        3.3                        Food & Drink        debit
2024-02-17        Citi PremierMiles        BUS/MRT 392340087 SINGAPORE SG XXXX-XXXX-XXXX-1381        1.09                        Auto & Transport        debit
2024-02-19        Citi PremierMiles        FORTYTWO PTE LTD SINGAPORE SG        1058                        Shopping        debit
2024-02-22        Citi PremierMiles        Lazada Singapore SG        106.06                        Shopping        debit
2024-02-22        Citi PremierMiles        LAZADA SINGAPORE SINGAPORE SG        11.1                        Other Income        credit
2024-02-22        Citi PremierMiles        Lazada Singapore SG        14.89                        Other Income        credit
2024-02-22        Citi PremierMiles        Lazada Singapore SG        21.67                        Other Income        credit
2024-02-23        Citi PremierMiles        Viewqwest Pte Ltd INTERNET SG        29.99                        Rent & Utilities        debit
2024-02-23        Citi PremierMiles        SPOTIFY STOCKHOLM SE        14.98                        Subscriptions        debit
2024-02-23        Citi PremierMiles        TADA RIDE 50101B SINGAPORE SG        9.32                        Auto & Transport        debit
2024-02-23        Citi PremierMiles        BUS/MRT 395533498 SINGAPORE SG XXXX-XXXX-XXXX-1530        1.09                        Auto & Transport        debit
2024-02-23        Citi PremierMiles        7-ELEVEN - 35 ROBINSON RDSINGAPORE SG XXXX-XXXX-XXXX-1530        1                        Food & Drink        debit
2024-02-24        Citi PremierMiles        MANDALA CLUB SINGAPORE SG        280.57                        Food & Drink        debit
2024-02-24        Citi PremierMiles        DON DON DONKI - 100AM SINGAPORE SG XXXX-XXXX-XXXX-1381        81.85                        Food & Drink        debit
2024-02-24        Citi PremierMiles        SO GOOD BAKERY - AMARA SINGAPORE SG XXXX-XXXX-XXXX-1530        12.5                        Food & Drink        debit
2024-02-24        Citi PremierMiles        TADA RIDE 169A16 SINGAPORE SG        9.53                        Auto & Transport        debit
2024-02-24        Citi PremierMiles        TADA RIDE 005B80 SINGAPORE SG        9.53                        Auto & Transport        debit
2024-02-24        Citi PremierMiles        BUS/MRT 396006968 SINGAPORE SG XXXX-XXXX-XXXX-1530        1.09                        Auto & Transport        debit
2024-02-24        Citi PremierMiles        CCY CONVERSION FEE SGD 14.98        0.14                        Fees        debit
2024-02-25        Citi PremierMiles        TIONG BAHRU BAKERY Singapore SG XXXX-XXXX-XXXX-1381        27.94                        Food & Drink        debit
2024-02-25        Citi PremierMiles        TADA RIDE 2A6B2D SINGAPORE SG        8.51                        Auto & Transport        debit
2024-02-25        Citi PremierMiles        BUS/MRT 396383371 SINGAPORE SG XXXX-XXXX-XXXX-1381        2.58                        Auto & Transport        debit
2024-02-25        Citi PremierMiles        BUS/MRT 396356836 SINGAPORE SG XXXX-XXXX-XXXX-1530        1.09                        Auto & Transport        debit
2024-02-28        Citi PremierMiles        APPLE.COM/BILL ITUNES.COM IE        13.98                        Subscriptions        debit
2024-02-28        Citi PremierMiles        CLASSPASS* MONTHLY SINGAPORE SG        5                        Subscriptions        debit
2024-02-29        Citi PremierMiles        TADA RIDE 7D1DDD SINGAPORE SG        12.38                        Auto & Transport        debit
2024-02-29        Citi PremierMiles        BUS/MRT 398641539 SINGAPORE SG XXXX-XXXX-XXXX-1381        1.19                        Auto & Transport        debit
2024-02-29        Citi PremierMiles        CCY CONVERSION FEE SGD 13.98        0.13                        Fees        debit
2024-03-01        Citi PremierMiles        NETFLIX INTERNATIONAL B.VAmsterdam NL EUR 12.99 EUR 12.99        19.62                        Subscriptions        debit
2024-03-02        Citi PremierMiles        CIRCLES.LIFE SINGAPORE SG        26.06                        Rent & Utilities        debit
2024-03-02        Citi PremierMiles        TADA RIDE F8DA05 SINGAPORE SG        11.06                        Auto & Transport        debit
2024-03-03        Citi PremierMiles        DAISO JAPAN - VIVO SINGAPORE SG XXXX-XXXX-XXXX-1530        60.16                        Shopping        debit
2024-03-03        Citi PremierMiles        TIMEZONE VIVOCITY SINGAPORE SG XXXX-XXXX-XXXX-1381        38                        Entertainment        debit
2024-03-03        Citi PremierMiles        TADA RIDE 8DF37F SINGAPORE SG        11.36                        Auto & Transport        debit
2024-03-03        Citi PremierMiles        7 ELEVEN-VIVOCITY#02-216CSINGAPORE SG XXXX-XXXX-XXXX-1381        2.6                        Food & Drink        debit
2024-03-04        Citi PremierMiles        CASTLERY* R928567655 SINGAPORE SG XXXX-XXXX-XXXX-1381        1599                        Shopping        debit
2024-03-05        Citi PremierMiles        240305_0907_22673_0000 SINGAPORE SG        139                        Shopping        debit
2024-03-05        Citi PremierMiles        ESSEN@PINNACLE ST8 Singapore SG XXXX-XXXX-XXXX-2766        30                        Food & Drink        debit
2024-03-05        Citi PremierMiles        TADA RIDE 9D1725 SINGAPORE SG        12.08                        Auto & Transport        debit
2024-03-05        Citi PremierMiles        THERE WAS NO COFFEE SINGAPORE SG XXXX-XXXX-XXXX-2766        6.5                        Food & Drink        debit
2024-03-05        Citi PremierMiles        BUS/MRT 431599476 SINGAPORE SG XXXX-XXXX-XXXX-2766        2.28                        Auto & Transport        debit
2024-03-07        Citi PremierMiles        fp*Food Panda Singapore SG XXXX-XXXX-XXXX-1381        94.14                        Food & Drink        debit
2024-03-07        Citi PremierMiles        fp*Food Panda Singapore SG XXXX-XXXX-XXXX-1381        91.29                        Food & Drink        debit
2024-03-07        Citi PremierMiles        OPENAI HTTPSOPENAI.CUS USD 5.19 USD 5.19        7.2                        Subscriptions        debit
2024-03-07        Citi PremierMiles        fp*Food Panda Singapore SG XXXX-XXXX-XXXX-1381        94.14                        Other Income        credit
2024-03-08        Citi PremierMiles        JUMBO SEAFOOD @ DEMPSEY Singapore SG        414.76                        Food & Drink        debit
2024-03-08        Citi PremierMiles        TADA RIDE D20FA8 SINGAPORE SG        16.77                        Auto & Transport        debit
2024-03-08        Citi PremierMiles        Microsoft*Xbox msbill.info SG        11.55                        Entertainment        debit
2024-03-09        Citi PremierMiles        TIONG BAHRU BAKERY Singapore SG XXXX-XXXX-XXXX-1381        59.05                        Food & Drink        debit
2024-03-09        Citi PremierMiles        7-ELEVEN-EVERTON PARK SINGAPORE SG XXXX-XXXX-XXXX-1381        19.8                        Food & Drink        debit
2024-03-10        Citi PremierMiles        TADA RIDE 51C3D2 SINGAPORE SG        29.13                        Auto & Transport        debit
2024-03-10        Citi PremierMiles        TADA RIDE 7850DE SINGAPORE SG        27.7                        Auto & Transport        debit
2024-03-11        Citi PremierMiles        Hyatt Regency Sydney OPI Sydney AU AUD 692.92 AUD 692.92        634.01                        Travel        debit
2024-03-11        Citi PremierMiles        UBER *TRIP SYDNEY AU XXXX-XXXX-XXXX-1381 AUD 63.78 AUD 63.78        58.15                        Auto & Transport        debit
2024-03-11        Citi PremierMiles        Industry Beans YorkSt Sydney AU XXXX-XXXX-XXXX-1381 AUD 38.20 AUD 38.20        34.95                        Food & Drink        debit
2024-03-11        Citi PremierMiles        SQ *MACHINE HALL Sydney AU XXXX-XXXX-XXXX-1381 AUD 10.00 AUD 10.00        9.12                        Food & Drink        debit
2024-03-12        Citi PremierMiles        Hyatt Regency Sydney Sydney AU AUD 31.17 AUD 31.17        28.42                        Food & Drink        debit
2024-03-12        Citi PremierMiles        Hyatt Regency Sydney Sydney AU XXXX-XXXX-XXXX-1381 AUD 28.67 AUD 28.67        26.14                        Food & Drink        debit
2024-03-14        Citi PremierMiles        APPLE.COM/BILL ITUNES.COM IE        13.98                        Subscriptions        debit
2024-03-14        Citi PremierMiles        SQ *MACHINE HALL Sydney AU XXXX-XXXX-XXXX-1381 AUD 5.00 AUD 5.00        4.56                        Food & Drink        debit
2024-03-14        Citi PremierMiles        CCY CONVERSION FEE SGD 13.98        0.13                        Fees        debit
2024-03-15        Citi PremierMiles        Falcha Townhall Sydney AU XXXX-XXXX-XXXX-1381 AUD 104.53 AUD 104.53        95.38                        Food & Drink        debit
2024-03-15        Citi PremierMiles        Uniqlo Australia Pty Ltd Melbourne AU XXXX-XXXX-XXXX-1381 AUD 14.90 AUD 14.90        13.6                        Shopping        debit
2024-03-15        Citi PremierMiles        VILLAGE GROCER ON KE SYDNEY AU XXXX-XXXX-XXXX-1381 AUD 5.98 AUD 5.98        5.45                        Food & Drink        debit
2024-03-15        Citi PremierMiles        TSG CITY CENTRE SYDNEY AU XXXX-XXXX-XXXX-1381 AUD 3.50 AUD 3.50        3.19                        Food & Drink        debit
2024-03-16        Citi PremierMiles        UBER *TRIP SYDNEY AU XXXX-XXXX-XXXX-1381 AUD 44.87 AUD 44.87        40.79                        Auto & Transport        debit
2024-03-16        Citi PremierMiles        UBER *TRIP SYDNEY AU XXXX-XXXX-XXXX-1381 AUD 28.87 AUD 28.87        26.25                        Auto & Transport        debit
2024-03-16        Citi PremierMiles        SYDNEY BANGLA FOODS BRONTE AU XXXX-XXXX-XXXX-1381 AUD 24.36 AUD 24.36        22.15                        Food & Drink        debit
2024-03-16        Citi PremierMiles        2 IN 1 DESIGN SYDNEY AU XXXX-XXXX-XXXX-1381 AUD 12.14 AUD 12.14        11.04                        Food & Drink        debit
2024-03-16        Citi PremierMiles        UBER *TRIP SYDNEY AU XXXX-XXXX-XXXX-1381 AUD 9.38 AUD 9.38        8.53                        Auto & Transport        debit
2024-03-16        Citi PremierMiles        E-Buy Global Limited Hong Kong HK        8                        Fees        debit
2024-03-16        Citi PremierMiles        MAYA GROCER PTY LTD Bronte AU XXXX-XXXX-XXXX-1381 AUD 4.09 AUD 4.09        3.72                        Food & Drink        debit
2024-03-17        Citi PremierMiles        LULULEMON ATHLETICA AUSTRAlexandria AU XXXX-XXXX-XXXX-1381 AUD 167.00 AUD 167.00        151.84                        Shopping        debit
2024-03-17        Citi PremierMiles        Huntley Projects CBD Sydney AU XXXX-XXXX-XXXX-1381 AUD 39.43 AUD 39.43        35.85                        Food & Drink        debit
2024-03-17        Citi PremierMiles        AIRPORT RETAIL ENTER MASCOT AU XXXX-XXXX-XXXX-1381 AUD 35.39 AUD 35.39        32.17                        Shopping        debit`;
const DELAY_BETWEEN_CALLS_MS = 0; // Delay between API calls to avoid rate limits (1 second)

// Types
interface ProcessingResult {
  filename: string;
  success: boolean;
  error?: string;
  skipped?: boolean;
}

interface Summary {
  total: number;
  successful: number;
  failed: number;
  skipped: number;
  errors: Array<{ filename: string; error: string }>;
}

// Validate API key
if (!OPENAI_API_KEY) {
  console.error("❌ Error: OPENAI_API_KEY environment variable is not set");
  console.error("\nUsage:");
  console.error("  OPENAI_API_KEY=sk-... pnpm extract-statements");
  console.error("\nOr export it in your shell:");
  console.error("  export OPENAI_API_KEY=sk-...");
  console.error("  pnpm extract-statements");
  process.exit(1);
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Ensure folders exist
const ensureFoldersExist = (): void => {
  if (!fs.existsSync(STATEMENTS_FOLDER)) {
    fs.mkdirSync(STATEMENTS_FOLDER, { recursive: true });
    console.log(`✓ Created folder: ${STATEMENTS_FOLDER}`);
  }
  if (!fs.existsSync(OUTPUT_FOLDER)) {
    fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });
    console.log(`✓ Created folder: ${OUTPUT_FOLDER}`);
  }
};

// Get all PDF files from statements folder
const getPdfFiles = (): string[] => {
  if (!fs.existsSync(STATEMENTS_FOLDER)) {
    return [];
  }

  const files = fs.readdirSync(STATEMENTS_FOLDER);
  return files
    .filter((file) => file.toLowerCase().endsWith(".pdf"))
    .map((file) => path.join(STATEMENTS_FOLDER, file));
};

// Check if file already processed
const isAlreadyProcessed = (pdfPath: string): boolean => {
  const filename = path.basename(pdfPath, ".pdf");
  const outputPath = path.join(OUTPUT_FOLDER, `${filename}.md`);
  return fs.existsSync(outputPath);
};

// Read PDF and convert to base64
const readPdfAsBase64 = (filePath: string): string => {
  const pdfBuffer = fs.readFileSync(filePath);
  return pdfBuffer.toString("base64");
};

// Sleep utility for retry backoff
const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// Call OpenAI API with retry logic
// Uses direct PDF file upload via base64 encoding
const extractTransactions = async (
  pdfBase64: string,
  filename: string
): Promise<string> => {
  const maxRetries = 5;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt === 0) {
        console.log(`  📤 Sending API request for ${filename}...`);
        const pdfSizeKB = (pdfBase64.length * 3) / 4 / 1024;
        console.log(`  📊 PDF size: ${pdfSizeKB.toFixed(2)} KB (base64 encoded)`);
      }
      
      // Use Responses API with PDF file input (supports direct PDF upload)
      // OpenAI supports PDFs directly via base64 encoding
      const response = await openai.responses.create({
        model: MODEL,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "You are a helpful assistant that extracts transactions from bank statements. you will be given a pdf file of a bank statement and you will need to extract the transactions into a csv table i can copy paste into a spreadsheet. make sure the date field is in the correct format YYYY-MM-DD. make sure you reply only with the table and nothing else. Use this header: date account description amount category type(credit/debit)",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: PROMPT,
              },
              {
                type: "input_file",
                filename: filename,
                file_data: `data:application/pdf;base64,${pdfBase64}`,
              },
            ],
          },
        ],
      });

      const content = response.output_text;
      if (!content) {
        throw new Error("No content in OpenAI response");
      }

      // Add delay after successful API call to avoid rate limits
      await sleep(DELAY_BETWEEN_CALLS_MS);

      return content;
    } catch (error: unknown) {
      // Log detailed error information for debugging
      console.error(`\n  🔍 Error details for ${filename} (attempt ${attempt + 1}/${maxRetries}):`);
      console.error(`  Error type: ${error instanceof Error ? error.constructor.name : typeof error}`);
      console.error(`  Error message: ${error instanceof Error ? error.message : String(error)}`);
      
      if (error && typeof error === "object") {
        // Log all properties of the error object
        const errorObj = error as Record<string, unknown>;
        console.error(`  Error properties:`, Object.keys(errorObj));
        
        // Check for OpenAI-specific error properties
        if ("status" in errorObj) {
          console.error(`  Status code: ${errorObj.status}`);
        }
        if ("code" in errorObj) {
          console.error(`  Error code: ${errorObj.code}`);
        }
        if ("response" in errorObj) {
          console.error(`  Response:`, JSON.stringify(errorObj.response, null, 2));
        }
        if ("error" in errorObj && errorObj.error && typeof errorObj.error === "object") {
          const apiError = errorObj.error as Record<string, unknown>;
          console.error(`  API Error:`, JSON.stringify(apiError, null, 2));
          if ("message" in apiError) {
            console.error(`  API Error message: ${apiError.message}`);
          }
          if ("type" in apiError) {
            console.error(`  API Error type: ${apiError.type}`);
          }
        }
      }

      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if it's a rate limit error - check multiple possible indicators
      let isRateLimit = false;
      let rateLimitReason = "";

      if (error && typeof error === "object") {
        const errorObj = error as Record<string, unknown>;
        
        // Check status code
        if ("status" in errorObj && errorObj.status === 429) {
          isRateLimit = true;
          rateLimitReason = "status code 429";
        }
        
        // Check error code
        if ("code" in errorObj && (errorObj.code === "rate_limit_exceeded" || errorObj.code === "429")) {
          isRateLimit = true;
          rateLimitReason = `error code: ${errorObj.code}`;
        }
        
        // Check nested error object
        if ("error" in errorObj && errorObj.error && typeof errorObj.error === "object") {
          const apiError = errorObj.error as Record<string, unknown>;
          if ("code" in apiError && (apiError.code === "rate_limit_exceeded" || apiError.code === "429")) {
            isRateLimit = true;
            rateLimitReason = `nested error code: ${apiError.code}`;
          }
          if ("type" in apiError && String(apiError.type).includes("rate_limit")) {
            isRateLimit = true;
            rateLimitReason = `error type: ${apiError.type}`;
          }
        }
      }
      
      // Check error message
      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();
        if (errorMsg.includes("429") || errorMsg.includes("rate limit") || errorMsg.includes("rate_limit")) {
          isRateLimit = true;
          rateLimitReason = `message contains rate limit indicator`;
        }
      }

      if (isRateLimit) {
        const backoffMs = Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        console.log(
          `  ⚠️  Rate limit detected (${rateLimitReason}) for ${filename}, retrying in ${backoffMs / 1000}s... (attempt ${attempt + 1}/${maxRetries})`
        );
        await sleep(backoffMs);
        continue;
      }

      // For other errors, log that it's not a rate limit
      console.error(`  ❌ Non-rate-limit error detected for ${filename}`);

      // For other errors, add delay before retrying (if not last attempt)
      if (attempt < maxRetries - 1) {
        await sleep(DELAY_BETWEEN_CALLS_MS);
      }

      // For other errors, throw immediately
      throw lastError;
    }
  }

  throw lastError || new Error("Max retries exceeded");
};

// Validate markdown table format
const validateMarkdownTable = (content: string): boolean => {
  const hasTableMarkers = content.includes("|") && content.includes("---");
  return hasTableMarkers;
};

// Process a single PDF file
const processPdfFile = async (pdfPath: string): Promise<ProcessingResult> => {
  const filename = path.basename(pdfPath);

  // Check if already processed
  if (isAlreadyProcessed(pdfPath)) {
    return {
      filename,
      success: true,
      skipped: true,
    };
  }

    try {
      console.log(`📄 Processing: ${filename}`);

      // Read PDF and convert to base64
      const pdfBase64 = readPdfAsBase64(pdfPath);

      // Extract transactions using OpenAI with direct PDF upload
      const extractedContent = await extractTransactions(pdfBase64, filename);

    // Validate format
    const isValidFormat = validateMarkdownTable(extractedContent);
    if (!isValidFormat) {
      console.log(
        `  ⚠️  Warning: Response may not be in expected markdown table format`
      );
    }

    // Save to output file
    const outputFilename = path.basename(pdfPath, ".pdf") + ".md";
    const outputPath = path.join(OUTPUT_FOLDER, outputFilename);
    fs.writeFileSync(outputPath, extractedContent, "utf-8");

    console.log(`  ✓ Completed: ${filename}`);

    return {
      filename,
      success: true,
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.log(`  ❌ Failed: ${filename} - ${errorMessage}`);

    return {
      filename,
      success: false,
      error: errorMessage,
    };
  }
};

// Process files in batches with concurrency limit
const processFilesInBatches = async (
  files: string[]
): Promise<ProcessingResult[]> => {
  const results: ProcessingResult[] = [];

  for (let i = 0; i < files.length; i += CONCURRENCY_LIMIT) {
    const batch = files.slice(i, i + CONCURRENCY_LIMIT);
    const batchPromises = batch.map((file) => processPdfFile(file));
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Add delay between batches to avoid rate limits
    if (i + CONCURRENCY_LIMIT < files.length) {
      await sleep(DELAY_BETWEEN_CALLS_MS);
    }
  }

  return results;
};

// Generate summary report
const generateSummary = (results: ProcessingResult[]): Summary => {
  const summary: Summary = {
    total: results.length,
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  for (const result of results) {
    if (result.skipped) {
      summary.skipped++;
    } else if (result.success) {
      summary.successful++;
    } else {
      summary.failed++;
      if (result.error) {
        summary.errors.push({
          filename: result.filename,
          error: result.error,
        });
      }
    }
  }

  return summary;
};

// Print summary report
const printSummary = (summary: Summary): void => {
  console.log("\n" + "=".repeat(60));
  console.log("📊 Summary Report");
  console.log("=".repeat(60));
  console.log(`Total files:     ${summary.total}`);
  console.log(`✓ Successful:    ${summary.successful}`);
  console.log(`⏭️  Skipped:       ${summary.skipped}`);
  console.log(`❌ Failed:        ${summary.failed}`);

  if (summary.errors.length > 0) {
    console.log("\n❌ Failed Files:");
    for (const error of summary.errors) {
      console.log(`  • ${error.filename}: ${error.error}`);
    }
  }

  console.log("=".repeat(60) + "\n");
};

// Main execution
const main = async (): Promise<void> => {
  console.log("🚀 Starting PDF Statement Extraction\n");

  // Ensure folders exist
  ensureFoldersExist();

  // Get PDF files
  const pdfFiles = getPdfFiles();

  if (pdfFiles.length === 0) {
    console.log("ℹ️  No PDF files found in statements/ folder");
    return;
  }

  console.log(`Found ${pdfFiles.length} PDF file(s) to process\n`);

  // Process files in parallel batches
  const results = await processFilesInBatches(pdfFiles);

  // Generate and print summary
  const summary = generateSummary(results);
  printSummary(summary);

  // Exit with error code if any failures
  if (summary.failed > 0) {
    process.exit(1);
  }
};

// Run main function
main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
