const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const SerialPort = require('serialport');
const express = require('express');
const multer = require('multer');
const bodyParser = require("body-parser");


const RECEIPT_WIDTH = 384;

const BYTE_SIZE = 8;

const BMP_BYTES_PER_LINE = RECEIPT_WIDTH / BYTE_SIZE;

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
    baudRate: 9600,
    dataBits: 8,
    parity: 'none',
    stopBits: 1,
    dataBits: 8,
}, (err) => {
    if (err) {
        console.log('Error: ', err.message)
    }
});

function dithering(pixels, width, height) {

    let newImage = new Array(width * height).fill(0);
    for (let y = 0; y < height; y++) {
        for (x = 0; x < width; x++) {
            oldpixel = pixels[y * width + x];
            let quantError;
            if (pixels > 127.5) {
                quantError = oldpixel - 255;
                oldpixel = 255;
            }
            else {
                quantError = oldpixel;
                oldpixel = 0;
            }
            newImage[y * width + x] = oldpixel;
            if (x != width - 1) {
                pixels[y * width + (x + 1)] += 7 / 16 * quantError;
            }
            if ((x != 0) && (y != height - 1)) {
                pixels[(y + 1) * width + (x - 1)] += 3 / 16 * quantError;
            }
            if (y != height - 1) {
                pixels[(y + 1) * width + x] += 5 / 16 * quantError;
            }
            if (x != width - 1 && y != height - 1) {
                pixels[(y + 1) * width + (x + 1)] += 1 / 16 * quantError;
            }
        }
    }

    return newImage;

}


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
    
            const renderCanvas = createCanvas(RECEIPT_WIDTH, size.y);
            const renderCtx = renderCanvas.getContext('2d');
            renderCtx.fillStyle = '#000';
            renderCtx.strokeStyle = '#000';
            renderCtx.lineWidth = 1;
    
            let offset = { x: 0, y: 0 };
            this.drawLogo(renderCtx, images[0], offset, true);
            this.drawResultText(renderCtx, text, offset, true);
            this.drawHeading(renderCtx, images[1], offset, true);
            this.drawMessage(renderCtx, offset, true);
    
            // let header = new Buffer.from([ parseInt('0x1c', 16), parseInt('0x2a', 16), parseInt('0x65', 16) ]);
            let color = renderCtx.getImageData(0, 0, RECEIPT_WIDTH, offset.y);
            let mono = dithering(color, RECEIPT_WIDTH, offset.y);
            
            let height = mono.length / RECEIPT_WIDTH;
    
            const maxLine = offset.y;
            console.log(offset);
    
            console.log('print start');
            let header = new Buffer.from(
            [
                parseInt('0x1c', 16),
                parseInt('0x2a', 16),
                parseInt('0x65', 16),
                parseInt( (height & 0xff00) >>> 8),
                parseInt(height & 0x00ff)
            ]);
            printer.write(header,
                (err) => {
                    if (err) console.log(err);
                }
            );

            for (let from = 0, len = mono.length; from < len; from+=MAX_USBFS_BUFFER_SIZE) {
                let to = Math.min(arr.length, from + MAX_USBFS_BUFFER_SIZE);
                let sendSize = (to - from);
                let buffer = new ArrayBuffer( sendSize / 8 );
                let dv = new DataView(buffer);

                for (let byteindex = 0; byteindex < sendSize; byteindex++) {
                    let byteVal = 0x00;
                    for (let cnt = 0; cnt < BYTE_SIZE; cnt++) {
                        var val = mono[from + byteindex * BYTE_SIZE + cnt];
                        if (127.5 > val) {
                            byteVal = (byteVal | 0x01);
                        }
                        byteVal = (byteVal << 1);
                    }
                    dv.setUint8(byteindex, byteVal);
                }
                console.log(buffer);
                // printer.write(new Buffer.from(buffer), (err) => {
                //     if (err) console.log(err);
                // });

            }

            // for (let line = 0; line < maxLine; line++) {
            //     let buffer = new ArrayBuffer( (BMP_BYTES_PER_LINE / 8) * maxLine );
            //     let dv = new DataView(buffer);
            //     for (let byte = 0; byte < BMP_BYTES_PER_LINE / 16; byte++) {
            //         let byteVal = 0;
            //         for (let x = 0; x < 16; x++) {
            //             var val = mono[ line * RECEIPT_WIDTH + byte * 16 + x];
            //             if (127.5 > val) {
            //                 byteVal = (byteVal | 0x0001);
            //             }
            //             byteVal = byteVal << 1;
            //         }
            //         var index = line * 3 + byte;
            //         dv.setUint16(index, byteVal);
            //     }
            //     printer.write(new Buffer.from([byteVal]), (err) => {
            //         if (err) console.log(err);
            //     });
            // }
            console.log('finish');
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
    console.log(text);
    // console.log(req);
    generator.generateImage(text);
    res.send({status: 'OK'});
});

printer.on('open', (err) => {
    app.listen(3000, () => console.log('Listening on port 3000'));
});

