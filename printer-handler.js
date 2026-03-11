/**
 * YeYeKao 专用蓝牙打印插件 (ESC/POS)
 * 支持 58mm 热敏打印机，自动处理通道匹配
 */
const PrinterHandler = {
    printChar: null,

    // 1. 连接打印机（全频道自动扫描）
    async connect() {
        if (this.printChar) return true;
        try {
            const device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [
                    '000018f0-0000-1000-8000-00805f9b34fb', // 常见热敏 ID
                    '49535343-fe7d-41aa-8a56-7243aa4d1211',
                    'e7e11102-4966-433d-8573-e741c21ebc31'
                ]
            });
            const server = await device.gatt.connect();
            const services = await server.getPrimaryServices();
            
            for (const service of services) {
                const characteristics = await service.getCharacteristics();
                // 寻找具备写入权限的特征值
                const found = characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse);
                if (found) {
                    this.printChar = found;
                    break;
                }
            }
            if (!this.printChar) throw new Error("未找到打印通道");
            return true;
        } catch (e) {
            console.error("蓝牙连接失败:", e);
            alert("连接失败: " + e.message);
            return false;
        }
    },

    // 2. 核心打印函数
    async printReceipt(data) {
        const isReady = await this.connect();
        if (!isReady) return;

        const encoder = new TextEncoder();
        
        // --- 构造小票文本 ---
        let r = `\x1B\x40`; // 初始化打印机指令
        r += `\x1B\x61\x01      YeYeKao BBQ\n`; // 居中
        r += `\x1B\x61\x00------------------------------\n`; // 左对齐
        r += `桌号: ${data.tableNum} 号桌\n`;
        r += `时间: ${new Date().toLocaleString()}\n`;
        r += `------------------------------\n`;
        
        data.items.forEach(it => {
            // 简单排版：名字占14字节，后面跟数量和价格
            let name = it.name.substring(0, 7).padEnd(12);
            r += `${name} x${it.quantity.toString().padEnd(4)} ${it.price}\n`;
        });

        r += `------------------------------\n`;
        r += `合计: ${data.total} Ks\n`;
        if(data.discount > 0) r += `优惠: -${data.discount} Ks\n`;
        r += `实收: ${data.final} Ks\n`;
        r += `------------------------------\n`;
        r += `\x1B\x61\x01   谢谢惠顾，欢迎下次光临\n\n\n\n\n`; // 留白撕纸

        // --- 分包发送（防止蓝牙溢出导致不打印） ---
        const bytes = encoder.encode(r);
        const step = 20;
        for (let i = 0; i < bytes.length; i += step) {
            await this.printChar.writeValue(bytes.slice(i, i + step));
        }
    }
};