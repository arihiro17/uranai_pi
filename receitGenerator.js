const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const SerialPort = require('serialport');
const express = require('express');
const multer = require('multer');
const bodyParser = require("body-parser");


const RECEIPT_WIDTH = 384;

const BMP_BYTES_PER_LINE = RECEIPT_WIDTH / 8;

const DEFAULT_TIMEOUT = 10000;

const MAX_USBFS_BUFFER_SIZE = 16384;

const MESSAGE_ARRAY = [
    "そのままで大丈夫！",
    "携帯落とさないでね",
    "体には気をつけてね",
    "財布忘れないでね",
    "月曜日気をつけてね",
    "火曜日気をつけてね",
    "水曜日気をつけてね",
    "木曜日気をつけてね",
    "金曜日気をつけてね",
];

const printer = new SerialPort('/dev/ttyAMA0', {
    baudRate: 38400,
    dataBits: 8,
});


class ReceiptGenerater {
    generateImage(text) {
        Promise.all([
            loadImage(path.join(__dirname, './receiptParts/logo.png')),
            loadImage(path.join(__dirname, './receiptParts/heading.png')),
        ]).then((images) => {

            const calcCanvas = createCanvas(0, 0);
            const calcCtx = calcCanvas.getContext('2d');
            calcCtx.fillStyle = '#000';
            calcCtx.strokeStyle = '#000';
            calcCtx.lineWidth = 1;

            // キャンバスサイズ割り出し
            let size = { x: 0, y: 0 };
            this.drawLogo(calcCtx, images[0], size, false);
            this.drawResultText(calcCtx, text, size, false);
            this.drawHeading(calcCtx, images[1], size, false);
            this.drawMessage(calcCtx, size, false);

            const renderCanvas = createCanvas(0, 0);
            const renderCtx = renderCanvas.getContext('2d');
            renderCtx.fillStyle = '#000';
            renderCtx.strokeStyle = '#000';
            renderCtx.lineWidth = 1;

            let offset = { x: 0, y: 0 };
            this.drawLogo(calcCtx, images[0], offset, false);
            this.drawResultText(calcCtx, text, offset, false);
            this.drawHeading(calcCtx, images[1], offset, false);
            this.drawMessage(calcCtx, offset, false);

            let header = new Buffer.from([ parseInt('0x1c', 16), parseInt('0x2a', 16), parseInt('0x65', 16) ]);
            let color = renderCtx.getImageData(0, 0, RECEIPT_WIDTH, offset.y);
            let mono = [];
            for (let y = 0, height = color.height; y < height; y++) {
                for (let x = 0, width = color.width; x < width; x++) {
                    let i = (y * 4) * color.width + x * 4;
                    let pixelVal = parseInt((pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3, 10);
                    mono.push(pixelVal);
                }
            }
            
            let height = mono.length / BMP_BYTES_PER_LINE;
            let n1 = (height & 0xff00) >>> 8;
            let n2 = (height & 0x00ff);

            // プリンタに送信
            printer.write( Buffer.concat([header, n1, n2]), DEFAULT_TIMEOUT);
            for (let from = 0, len = mono.length; from < len; from += MAX_USBFS_BUFFER_SIZE) {
                let to = Math.min(mono.length, from + MAX_USBFS_BUFFER_SIZE);
                printer.write(mono.slice(from, to));
            }
        });
    }

    drawLogo(ctx, aImage, aOffset, isRender) {
        let posX = (RECEIPT_WIDTH / 2) - (aImage.width / 2);
        aOffset.y += 48;    // 上マージン
        if (isRender) {
            ctx.drawImage(aImage, posX, aOffset.y, aImage.width, aImage.height); // 画像配置
        }
        aOffset.y += aImage.height; // 画像高さをオフセットに加算
        aOffset.y += 60; 
    }

    drawResultText(ctx, aMsg, aOffset, isRender) {
        ctx.font = "bold 34px";

        aMsg = aMsg.replace('\n', '');
        let msgArr = [];
        for (let cnt = 0, len = aMsg.length/ 10; cnt < len; cnt++ ) {
            this.drawTextCenter(ctx, aMsg.substr(cnt * 10, 10), 34, 24,  aOffset, isRender);
        }
        aOffset.y += 45;    // 下マージン
    }

    drawMessage(ctx, aOffset, isRender) {
        ctx.font = "bold 22px";

        let index = Math.floor( Math.random() * MESSAGE_ARRAY.length );

        this.drawTextCenter(ctx, MESSAGE_ARRAY[index], 22, 0, aOffset, isRender);
        
        aOffset.y += 60;
    }

    drawHeading(ctx, aImage, aOffset, isRender) {
        if (isRender) {
            ctx.drawImage(aImage, 0, aOffset.y, aImage.width, aImage.height);   // 画像配置
        }
        aOffset.y += aImage.height;
        aOffset.y += 20;    // 下マージン
    }

    drawTextCenter(ctx, aMessage, aFontSize, aLineSpace, aOffset, isRender) {
        let metrics = ctx.measureText(aMessage);
        let textWidth = metrics.width;
        let offsetX = (RECEIPT_WIDTH / 2) - (textWidth / 2);
        aOffset.y += aFontSize + aLineSpace;
        if (isRender) {
            ctx.fillText(aMessage, offsetX, aOffset.y);
        }
    }
}

const generator = new ReceiptGenerater();

const app = express();
app.use(multer().none());
app.use(express.static('web'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.post('/api/generate', (req, res) => {
    const data = req.body;
    const text = data.text;
    // console.log(text);
    console.log(req);
    generator.generateImage(text);
    res.send({status: 'OK'});
});

app.listen(3000, () => console.log('Listening on port 3000'));
