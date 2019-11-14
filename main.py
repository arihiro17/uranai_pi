from janome.tokenizer import Tokenizer
import json
import re
import requests
import sys
import time
import math
from grove.adc import ADC

# テキストファイルを読み込む
sjis = open("lyrics.txt", "rb").read()
text = sjis.decode("utf_8")

# 形態素解析
t = Tokenizer()
words = t.tokenize(text)

# 辞書を作成
def make_dic(words):
    tmp = ["@"]
    dic = {}
    for i in words:
        word = i.surface
        if word == "" or word == "\r\n" or word == "\n": continue
        tmp.append(word)
        if len(tmp) < 3: continue
        if len(tmp) > 3: tmp = tmp[1:]
        set_word3(dic, tmp)
        if word == "。":
            tmp = ["@"]
            continue
    return dic

# 三要素のリストを辞書として登録
def set_word3(dic, s3):
    w1, w2, w3 = s3
    if not w1 in dic: dic[w1] = {}
    if not w2 in dic[w1]: dic[w1][w2] = {}
    if not w3 in dic[w1][w2]: dic[w1][w2][w3] = 0
    dic[w1][w2][w3] += 1

dic = make_dic(words)
json.dump(dic, open("markov-blob.json", "w", encoding="utf-8"))

# 自動生成
dic = open("markov-blob.json", "r")
dic = json.load(dic)

tweets_list = []
import random
def word_choice(sel):
    keys = sel.keys()
    ran = random.choice(list(keys))
    return ran

def make_sentence(dic):
    ret = []
    if not "@" in dic: return "no dic"
    top = dic["@"]
    w1 = word_choice(top)
    w2 = word_choice(top[w1])
    ret.append(w1)
    ret.append(w2)
    for i in range(32):
        w3 = word_choice(dic[w1][w2])
        ret.append(w3)
        if w3 == "\n": break
        w1, w2 = w2, w3
    tweets_list.append(ret)
    return "".join(ret)

def check(sentence):
    # print(sentence)
    # checkText = t.tokenize(sentence, stream=True)

    arr = re.split('[ 　]', sentence)
    # print(arr)
    arr[len(arr) - 1] = ''
    return "".join(arr)

    # for word in checkText:
    #     print(word)


# for i in range(1):
#     s = make_sentence(dic)
#     s = check(s)
#     # tweets_list.append(s)
#     print(s)


class GroveGSRSensor:
    def __init__(self, channel):
        self.channel = channel
        self.adc = ADC()
    
    @property
    def GSR(self):
        value = self.adc.read(self.channel)
        return value

Grove = GroveGSRSensor

def main():
    if len(sys.argv) < 2:
        print("Usage: {} adc_channel".format(sys.argv[0]))
        sys.exit(1)
    
    sensor = GroveGSRSensor(int(sys.argv[1]))

    print("Detecting...")
    while True:
        print("GSR value: {0}".format(sensor.GSR))
        if 300 > sensor.GSR:
            s = make_sentence(dic)
            s = check(s)
            response = requests.post(
                "http://127.0.0.1:3000/api/generate/",
                json.dump({'text': s}),
                headers={'Content-Type': 'application/json'}
            )
            time.sleep(30)

        time.sleep(.3)

if __name__ == "__main__":
    main()
