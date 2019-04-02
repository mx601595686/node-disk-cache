"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const os = require("os");
const path = require("path");
const fs = require("fs-extra");
const diskusage = require("diskusage");
class NodeDiskCache {
    constructor(options = {}) {
        //缓存数据索引列表。name:文件名,size:文件大小,timer:过期计时器
        this._cacheTable = new Map();
        //当前容量
        this._currentVolume = 0;
        //文件名称自增索引
        this._fileNameIndex = 0;
        //缓存目录
        this._cacheDir = options.cacheDir || path.join(os.tmpdir(), `NodeDiskCache_${Math.trunc(Math.random() * 10000)}`);
        if (NodeDiskCache._cacheDirList.has(this._cacheDir))
            throw new Error(`缓存目录已被占用：${this._cacheDir}`);
        fs.emptyDirSync(this._cacheDir);
        NodeDiskCache._cacheDirList.add(this._cacheDir);
        //清理缓存
        if (options.volumeUpLimit > 0) {
            const upLimit = options.volumeUpLimit;
            this._cleanerTimer = setInterval(() => {
                if (this._currentVolume > upLimit)
                    this._cleanCache(upLimit * 0.9);
            }, 5000);
        }
        else if (options.volumeUpLimitRate > 0) {
            const downLimitRate = 1 - Math.min(options.volumeUpLimitRate, 1);
            this._cleanerTimer = setInterval(async () => {
                try {
                    const usage = await diskusage.check(this._cacheDir);
                    if (usage.available / usage.total < downLimitRate)
                        this._cleanCache(this._currentVolume - usage.total * 0.1);
                }
                catch (err) {
                    console.error('获取缓存目录容量信息异常：', err);
                }
            }, 5000);
        }
        //缓存超时
        this._timeout = options.timeout > 0 ? options.timeout : 0;
        this._refreshTimeoutWhenGet = !!options.refreshTimeoutWhenGet;
    }
    /**
     * 清理缓存
     * @param downTo 将缓存大小下降到指定数值之下
     */
    _cleanCache(downTo) {
        (async () => {
            for (const [key, value] of this._cacheTable) {
                if (this._currentVolume > downTo) {
                    this._cacheTable.delete(key);
                    clearTimeout(value.timer);
                    await fs.remove(value.name);
                    this._currentVolume -= value.size;
                }
                else
                    break;
            }
        })().catch(err => console.error('清除缓存异常：', err));
    }
    /**
     * 设置或更新缓存
     */
    async set(key, value) {
        const cache = this._cacheTable.get(key) || { name: path.join(this._cacheDir, (this._fileNameIndex++).toString()), size: 0, timer: undefined };
        if (this._timeout > 0 && cache.timer !== undefined)
            clearTimeout(cache.timer);
        //保存缓存
        if (Buffer.isBuffer(value)) {
            await fs.promises.writeFile(cache.name, value);
            this._currentVolume += value.length - cache.size;
            cache.size = value.length;
        }
        else {
            await new Promise((resolve, reject) => {
                value.pipe(fs.createWriteStream(cache.name))
                    .on('error', reject)
                    .on('close', resolve);
            });
            const status = await fs.promises.stat(cache.name);
            this._currentVolume += status.size - cache.size;
            cache.size = status.size;
        }
        if (this._timeout > 0) {
            cache.timer = setTimeout(() => {
                this._cacheTable.delete(key);
                fs.remove(cache.name, err => {
                    if (err)
                        console.error('清除缓存异常：', err);
                    else
                        this._currentVolume -= cache.size;
                });
            }, this._timeout);
        }
        this._cacheTable.delete(key); //刷新缓存在列表中的排位
        this._cacheTable.set(key, cache);
    }
    /**
     * 获取缓存
     */
    async get(key) {
        const cache = this._cacheTable.get(key);
        if (cache) {
            if (this._refreshTimeoutWhenGet && this._timeout > 0) {
                clearTimeout(cache.timer);
                cache.timer = setTimeout(() => {
                    this._cacheTable.delete(key);
                    fs.remove(cache.name, err => {
                        if (err)
                            console.error('清除缓存异常：', err);
                        else
                            this._currentVolume -= cache.size;
                    });
                }, this._timeout);
            }
            return await fs.readFile(cache.name);
        }
        else
            return cache;
    }
    /**
     * 以流的方式获取缓存
     */
    getStream(key) {
        const cache = this._cacheTable.get(key);
        if (cache) {
            if (this._refreshTimeoutWhenGet && this._timeout > 0) {
                clearTimeout(cache.timer);
                cache.timer = setTimeout(() => {
                    this._cacheTable.delete(key);
                    fs.remove(cache.name, err => {
                        if (err)
                            console.error('清除缓存异常：', err);
                        else
                            this._currentVolume -= cache.size;
                    });
                }, this._timeout);
            }
            return fs.createReadStream(cache.name);
        }
        else
            return cache;
    }
    /**
     * 判断缓存是否存在
     */
    has(key) {
        return this._cacheTable.has(key);
    }
    /**
     * 删除缓存
     */
    async delete(key) {
        const cache = this._cacheTable.get(key);
        if (cache) {
            await fs.remove(cache.name);
            this._cacheTable.delete(key);
            clearTimeout(cache.timer);
            this._currentVolume -= cache.size;
        }
    }
    /**
     * 清空缓存
     */
    async empty() {
        for (const [key, value] of this._cacheTable) {
            await fs.remove(value.name);
            this._cacheTable.delete(key);
            clearTimeout(value.timer);
            this._currentVolume -= value.size;
        }
    }
    /**
     * 销毁缓存
     */
    async destroy() {
        await this.empty();
        clearInterval(this._cleanerTimer);
    }
}
//缓存目录列表，防止某一缓存目录被重复使用
NodeDiskCache._cacheDirList = new Set();
exports.default = NodeDiskCache;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImluZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUM3QiwrQkFBK0I7QUFDL0IsdUNBQXVDO0FBNkJ2QyxNQUFxQixhQUFhO0lBMEI5QixZQUFZLFVBQWdDLEVBQUU7UUF4QjlDLHlDQUF5QztRQUN4QixnQkFBVyxHQUFHLElBQUksR0FBRyxFQUEyRSxDQUFDO1FBaUJsSCxNQUFNO1FBQ0UsbUJBQWMsR0FBRyxDQUFDLENBQUM7UUFFM0IsVUFBVTtRQUNGLG1CQUFjLEdBQUcsQ0FBQyxDQUFDO1FBR3ZCLE1BQU07UUFDTixJQUFJLENBQUMsU0FBUyxHQUFHLE9BQU8sQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLEVBQUUsaUJBQWlCLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNsSCxJQUFJLGFBQWEsQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUM7WUFDL0MsTUFBTSxJQUFJLEtBQUssQ0FBQyxZQUFZLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBQ2xELEVBQUUsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ2hDLGFBQWEsQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUVoRCxNQUFNO1FBQ04sSUFBSSxPQUFPLENBQUMsYUFBdUIsR0FBRyxDQUFDLEVBQUU7WUFDckMsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLGFBQXVCLENBQUM7WUFDaEQsSUFBSSxDQUFDLGFBQWEsR0FBRyxXQUFXLENBQUMsR0FBRyxFQUFFO2dCQUNsQyxJQUFJLElBQUksQ0FBQyxjQUFjLEdBQUcsT0FBTztvQkFDN0IsSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEdBQUcsR0FBRyxDQUFDLENBQUM7WUFDeEMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1NBQ1o7YUFBTSxJQUFJLE9BQU8sQ0FBQyxpQkFBMkIsR0FBRyxDQUFDLEVBQUU7WUFDaEQsTUFBTSxhQUFhLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLGlCQUEyQixFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzNFLElBQUksQ0FBQyxhQUFhLEdBQUcsV0FBVyxDQUFDLEtBQUssSUFBSSxFQUFFO2dCQUN4QyxJQUFJO29CQUNBLE1BQU0sS0FBSyxHQUFHLE1BQU0sU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7b0JBQ3BELElBQUksS0FBSyxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUMsS0FBSyxHQUFHLGFBQWE7d0JBQzdDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLGNBQWMsR0FBRyxLQUFLLENBQUMsS0FBSyxHQUFHLEdBQUcsQ0FBQyxDQUFDO2lCQUNqRTtnQkFBQyxPQUFPLEdBQUcsRUFBRTtvQkFDVixPQUFPLENBQUMsS0FBSyxDQUFDLGVBQWUsRUFBRSxHQUFHLENBQUMsQ0FBQztpQkFDdkM7WUFDTCxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7U0FDWjtRQUVELE1BQU07UUFDTixJQUFJLENBQUMsUUFBUSxHQUFHLE9BQU8sQ0FBQyxPQUFpQixHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLE9BQWlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM5RSxJQUFJLENBQUMsc0JBQXNCLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxxQkFBcUIsQ0FBQztJQUNsRSxDQUFDO0lBRUQ7OztPQUdHO0lBQ0ssV0FBVyxDQUFDLE1BQWM7UUFDOUIsQ0FBQyxLQUFLLElBQUksRUFBRTtZQUNSLEtBQUssTUFBTSxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFO2dCQUN6QyxJQUFJLElBQUksQ0FBQyxjQUFjLEdBQUcsTUFBTSxFQUFFO29CQUM5QixJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDN0IsWUFBWSxDQUFDLEtBQUssQ0FBQyxLQUFZLENBQUMsQ0FBQztvQkFDakMsTUFBTSxFQUFFLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDNUIsSUFBSSxDQUFDLGNBQWMsSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDO2lCQUNyQzs7b0JBQ0csTUFBTTthQUNiO1FBQ0wsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLFNBQVMsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ3JELENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBVyxFQUFFLEtBQXFDO1FBQ3hELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLENBQUM7UUFFOUksSUFBSSxJQUFJLENBQUMsUUFBUSxHQUFHLENBQUMsSUFBSSxLQUFLLENBQUMsS0FBSyxLQUFLLFNBQVM7WUFDOUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUU5QixNQUFNO1FBQ04sSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQ3hCLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMvQyxJQUFJLENBQUMsY0FBYyxJQUFJLEtBQUssQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztZQUNqRCxLQUFLLENBQUMsSUFBSSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUM7U0FDN0I7YUFBTTtZQUNILE1BQU0sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7Z0JBQ2xDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztxQkFDdkMsRUFBRSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUM7cUJBQ25CLEVBQUUsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDOUIsQ0FBQyxDQUFDLENBQUM7WUFFSCxNQUFNLE1BQU0sR0FBRyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNsRCxJQUFJLENBQUMsY0FBYyxJQUFJLE1BQU0sQ0FBQyxJQUFJLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztZQUNoRCxLQUFLLENBQUMsSUFBSSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUM7U0FDNUI7UUFFRCxJQUFJLElBQUksQ0FBQyxRQUFRLEdBQUcsQ0FBQyxFQUFFO1lBQ25CLEtBQUssQ0FBQyxLQUFLLEdBQUcsVUFBVSxDQUFDLEdBQUcsRUFBRTtnQkFDMUIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQzdCLEVBQUUsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsRUFBRTtvQkFDeEIsSUFBSSxHQUFHO3dCQUNILE9BQU8sQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLEdBQUcsQ0FBQyxDQUFDOzt3QkFFOUIsSUFBSSxDQUFDLGNBQWMsSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDO2dCQUMxQyxDQUFDLENBQUMsQ0FBQztZQUNQLENBQUMsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7U0FDckI7UUFFRCxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFHLGFBQWE7UUFDN0MsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3JDLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBVztRQUNqQixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUV4QyxJQUFJLEtBQUssRUFBRTtZQUNQLElBQUksSUFBSSxDQUFDLHNCQUFzQixJQUFJLElBQUksQ0FBQyxRQUFRLEdBQUcsQ0FBQyxFQUFFO2dCQUNsRCxZQUFZLENBQUMsS0FBSyxDQUFDLEtBQVksQ0FBQyxDQUFDO2dCQUNqQyxLQUFLLENBQUMsS0FBSyxHQUFHLFVBQVUsQ0FBQyxHQUFHLEVBQUU7b0JBQzFCLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUM3QixFQUFFLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLEVBQUU7d0JBQ3hCLElBQUksR0FBRzs0QkFDSCxPQUFPLENBQUMsS0FBSyxDQUFDLFNBQVMsRUFBRSxHQUFHLENBQUMsQ0FBQzs7NEJBRTlCLElBQUksQ0FBQyxjQUFjLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQztvQkFDMUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ1AsQ0FBQyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQzthQUNyQjtZQUVELE9BQU8sTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztTQUN4Qzs7WUFDRyxPQUFPLEtBQUssQ0FBQztJQUNyQixDQUFDO0lBRUQ7O09BRUc7SUFDSCxTQUFTLENBQUMsR0FBVztRQUNqQixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUV4QyxJQUFJLEtBQUssRUFBRTtZQUNQLElBQUksSUFBSSxDQUFDLHNCQUFzQixJQUFJLElBQUksQ0FBQyxRQUFRLEdBQUcsQ0FBQyxFQUFFO2dCQUNsRCxZQUFZLENBQUMsS0FBSyxDQUFDLEtBQVksQ0FBQyxDQUFDO2dCQUNqQyxLQUFLLENBQUMsS0FBSyxHQUFHLFVBQVUsQ0FBQyxHQUFHLEVBQUU7b0JBQzFCLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUM3QixFQUFFLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLEVBQUU7d0JBQ3hCLElBQUksR0FBRzs0QkFDSCxPQUFPLENBQUMsS0FBSyxDQUFDLFNBQVMsRUFBRSxHQUFHLENBQUMsQ0FBQzs7NEJBRTlCLElBQUksQ0FBQyxjQUFjLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQztvQkFDMUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ1AsQ0FBQyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQzthQUNyQjtZQUVELE9BQU8sRUFBRSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztTQUMxQzs7WUFFRyxPQUFPLEtBQUssQ0FBQztJQUNyQixDQUFDO0lBRUQ7O09BRUc7SUFDSCxHQUFHLENBQUMsR0FBVztRQUNYLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDckMsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFXO1FBQ3BCLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRXhDLElBQUksS0FBSyxFQUFFO1lBQ1AsTUFBTSxFQUFFLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM1QixJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUM3QixZQUFZLENBQUMsS0FBSyxDQUFDLEtBQVksQ0FBQyxDQUFDO1lBQ2pDLElBQUksQ0FBQyxjQUFjLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQztTQUNyQztJQUNMLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxLQUFLO1FBQ1AsS0FBSyxNQUFNLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUU7WUFDekMsTUFBTSxFQUFFLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM1QixJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUM3QixZQUFZLENBQUMsS0FBSyxDQUFDLEtBQVksQ0FBQyxDQUFDO1lBQ2pDLElBQUksQ0FBQyxjQUFjLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQztTQUNyQztJQUNMLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxPQUFPO1FBQ1QsTUFBTSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDbkIsYUFBYSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUN0QyxDQUFDOztBQXpNRCxzQkFBc0I7QUFDRSwyQkFBYSxHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7QUFUOUQsZ0NBa05DIiwiZmlsZSI6ImluZGV4LmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgb3MgZnJvbSAnb3MnO1xyXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xyXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcy1leHRyYSc7XHJcbmltcG9ydCAqIGFzIGRpc2t1c2FnZSBmcm9tICdkaXNrdXNhZ2UnO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBOb2RlRGlza0NhY2hlT3B0aW9ucyB7XHJcbiAgICAvKipcclxuICAgICAqIOe8k+WtmOebruW9leWcsOWdgO+8jOm7mOiupCcvdG1wL05vZGVEaXNrQ2FjaGVfe3JhbmRvbX0nXHJcbiAgICAgKi9cclxuICAgIGNhY2hlRGlyPzogc3RyaW5nO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog57yT5a2Y5a656YeP5LiK6ZmQKGJ5dGUp77yM6buY6K6k5Li6MO+8jOayoeacieS4iumZkFxyXG4gICAgICovXHJcbiAgICB2b2x1bWVVcExpbWl0PzogbnVtYmVyO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICog5Yqo5oCB55uR5rWL57yT5a2Y55uu5b2V5Ymp5L2Z5a656YeP77yM5b2T5bey55So5a656YeP5Y2g5oC75a656YeP6LaF6L+H5oyH5a6a5q+U5L6L5ZCO5omn6KGM5riF55CG5pON5L2c44CC6IyD5Zu0MC0x77yM6buY6K6kMO+8jOayoeacieS4iumZkOOAguWmguaenOiuvue9ruS6hnZvbHVtZVVwTGltaXTliJnkvJrkvb/or6XlsZ7mgKflpLHmlYhcclxuICAgICAqL1xyXG4gICAgdm9sdW1lVXBMaW1pdFJhdGU/OiBudW1iZXI7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDorr7nva7nvJPlrZjov4fmnJ/ml7bpl7QobXMp77yMMOS4uuawuOS4jei/h+acn+OAgum7mOiupDBcclxuICAgICAqL1xyXG4gICAgdGltZW91dD86IG51bWJlcjtcclxuXHJcbiAgICAvKipcclxuICAgICAqIOW9k+iOt+WPlue8k+WtmOaXtuaYr+WQpumHjee9rnRpbWVvdXTvvIzpu5jorqRmYWxzZVxyXG4gICAgICovXHJcbiAgICByZWZyZXNoVGltZW91dFdoZW5HZXQ/OiBib29sZWFuO1xyXG59XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBOb2RlRGlza0NhY2hlIHtcclxuXHJcbiAgICAvL+e8k+WtmOaVsOaNrue0ouW8leWIl+ihqOOAgm5hbWU65paH5Lu25ZCNLHNpemU65paH5Lu25aSn5bCPLHRpbWVyOui/h+acn+iuoeaXtuWZqFxyXG4gICAgcHJpdmF0ZSByZWFkb25seSBfY2FjaGVUYWJsZSA9IG5ldyBNYXA8c3RyaW5nLCB7IG5hbWU6IHN0cmluZywgc2l6ZTogbnVtYmVyLCB0aW1lcjogTm9kZUpTLlRpbWVyIHwgdW5kZWZpbmVkIH0+KCk7XHJcblxyXG4gICAgLy/nvJPlrZjmlbDmja7lrZjmlL7nm67lvZVcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgX2NhY2hlRGlyOiBzdHJpbmc7XHJcblxyXG4gICAgLy/nvJPlrZjnm67lvZXliJfooajvvIzpmLLmraLmn5DkuIDnvJPlrZjnm67lvZXooqvph43lpI3kvb/nlKhcclxuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9jYWNoZURpckxpc3QgPSBuZXcgU2V0PHN0cmluZz4oKTtcclxuXHJcbiAgICAvL+e8k+WtmOi2heaXtlxyXG4gICAgcHJpdmF0ZSByZWFkb25seSBfdGltZW91dDogbnVtYmVyO1xyXG5cclxuICAgIC8v5piv5ZCm6I635Y+W57yT5a2Y5pe26YeN572udGltZW91dFxyXG4gICAgcHJpdmF0ZSByZWFkb25seSBfcmVmcmVzaFRpbWVvdXRXaGVuR2V0OiBib29sZWFuO1xyXG5cclxuICAgIC8v5riF55CG57yT5a2Y6K6h5pe25ZmoXHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IF9jbGVhbmVyVGltZXI6IE5vZGVKUy5UaW1lcjtcclxuXHJcbiAgICAvL+W9k+WJjeWuuemHj1xyXG4gICAgcHJpdmF0ZSBfY3VycmVudFZvbHVtZSA9IDA7XHJcblxyXG4gICAgLy/mlofku7blkI3np7Doh6rlop7ntKLlvJVcclxuICAgIHByaXZhdGUgX2ZpbGVOYW1lSW5kZXggPSAwO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKG9wdGlvbnM6IE5vZGVEaXNrQ2FjaGVPcHRpb25zID0ge30pIHtcclxuICAgICAgICAvL+e8k+WtmOebruW9lVxyXG4gICAgICAgIHRoaXMuX2NhY2hlRGlyID0gb3B0aW9ucy5jYWNoZURpciB8fCBwYXRoLmpvaW4ob3MudG1wZGlyKCksIGBOb2RlRGlza0NhY2hlXyR7TWF0aC50cnVuYyhNYXRoLnJhbmRvbSgpICogMTAwMDApfWApO1xyXG4gICAgICAgIGlmIChOb2RlRGlza0NhY2hlLl9jYWNoZURpckxpc3QuaGFzKHRoaXMuX2NhY2hlRGlyKSlcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDnvJPlrZjnm67lvZXlt7LooqvljaDnlKjvvJoke3RoaXMuX2NhY2hlRGlyfWApO1xyXG4gICAgICAgIGZzLmVtcHR5RGlyU3luYyh0aGlzLl9jYWNoZURpcik7XHJcbiAgICAgICAgTm9kZURpc2tDYWNoZS5fY2FjaGVEaXJMaXN0LmFkZCh0aGlzLl9jYWNoZURpcik7XHJcblxyXG4gICAgICAgIC8v5riF55CG57yT5a2YXHJcbiAgICAgICAgaWYgKG9wdGlvbnMudm9sdW1lVXBMaW1pdCBhcyBudW1iZXIgPiAwKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHVwTGltaXQgPSBvcHRpb25zLnZvbHVtZVVwTGltaXQgYXMgbnVtYmVyO1xyXG4gICAgICAgICAgICB0aGlzLl9jbGVhbmVyVGltZXIgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5fY3VycmVudFZvbHVtZSA+IHVwTGltaXQpXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fY2xlYW5DYWNoZSh1cExpbWl0ICogMC45KTtcclxuICAgICAgICAgICAgfSwgNTAwMCk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChvcHRpb25zLnZvbHVtZVVwTGltaXRSYXRlIGFzIG51bWJlciA+IDApIHtcclxuICAgICAgICAgICAgY29uc3QgZG93bkxpbWl0UmF0ZSA9IDEgLSBNYXRoLm1pbihvcHRpb25zLnZvbHVtZVVwTGltaXRSYXRlIGFzIG51bWJlciwgMSk7XHJcbiAgICAgICAgICAgIHRoaXMuX2NsZWFuZXJUaW1lciA9IHNldEludGVydmFsKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdXNhZ2UgPSBhd2FpdCBkaXNrdXNhZ2UuY2hlY2sodGhpcy5fY2FjaGVEaXIpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh1c2FnZS5hdmFpbGFibGUgLyB1c2FnZS50b3RhbCA8IGRvd25MaW1pdFJhdGUpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2NsZWFuQ2FjaGUodGhpcy5fY3VycmVudFZvbHVtZSAtIHVzYWdlLnRvdGFsICogMC4xKTtcclxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ+iOt+WPlue8k+WtmOebruW9leWuuemHj+S/oeaBr+W8guW4uO+8micsIGVycik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0sIDUwMDApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy/nvJPlrZjotoXml7ZcclxuICAgICAgICB0aGlzLl90aW1lb3V0ID0gb3B0aW9ucy50aW1lb3V0IGFzIG51bWJlciA+IDAgPyBvcHRpb25zLnRpbWVvdXQgYXMgbnVtYmVyIDogMDtcclxuICAgICAgICB0aGlzLl9yZWZyZXNoVGltZW91dFdoZW5HZXQgPSAhIW9wdGlvbnMucmVmcmVzaFRpbWVvdXRXaGVuR2V0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5riF55CG57yT5a2YXHJcbiAgICAgKiBAcGFyYW0gZG93blRvIOWwhue8k+WtmOWkp+Wwj+S4i+mZjeWIsOaMh+WumuaVsOWAvOS5i+S4i1xyXG4gICAgICovXHJcbiAgICBwcml2YXRlIF9jbGVhbkNhY2hlKGRvd25UbzogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgdGhpcy5fY2FjaGVUYWJsZSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX2N1cnJlbnRWb2x1bWUgPiBkb3duVG8pIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9jYWNoZVRhYmxlLmRlbGV0ZShrZXkpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh2YWx1ZS50aW1lciBhcyBhbnkpO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IGZzLnJlbW92ZSh2YWx1ZS5uYW1lKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9jdXJyZW50Vm9sdW1lIC09IHZhbHVlLnNpemU7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2VcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pKCkuY2F0Y2goZXJyID0+IGNvbnNvbGUuZXJyb3IoJ+a4hemZpOe8k+WtmOW8guW4uO+8micsIGVycikpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog6K6+572u5oiW5pu05paw57yT5a2YXHJcbiAgICAgKi9cclxuICAgIGFzeW5jIHNldChrZXk6IHN0cmluZywgdmFsdWU6IEJ1ZmZlciB8IE5vZGVKUy5SZWFkYWJsZVN0cmVhbSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIGNvbnN0IGNhY2hlID0gdGhpcy5fY2FjaGVUYWJsZS5nZXQoa2V5KSB8fCB7IG5hbWU6IHBhdGguam9pbih0aGlzLl9jYWNoZURpciwgKHRoaXMuX2ZpbGVOYW1lSW5kZXgrKykudG9TdHJpbmcoKSksIHNpemU6IDAsIHRpbWVyOiB1bmRlZmluZWQgfTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuX3RpbWVvdXQgPiAwICYmIGNhY2hlLnRpbWVyICE9PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgIGNsZWFyVGltZW91dChjYWNoZS50aW1lcik7XHJcblxyXG4gICAgICAgIC8v5L+d5a2Y57yT5a2YXHJcbiAgICAgICAgaWYgKEJ1ZmZlci5pc0J1ZmZlcih2YWx1ZSkpIHtcclxuICAgICAgICAgICAgYXdhaXQgZnMucHJvbWlzZXMud3JpdGVGaWxlKGNhY2hlLm5hbWUsIHZhbHVlKTtcclxuICAgICAgICAgICAgdGhpcy5fY3VycmVudFZvbHVtZSArPSB2YWx1ZS5sZW5ndGggLSBjYWNoZS5zaXplO1xyXG4gICAgICAgICAgICBjYWNoZS5zaXplID0gdmFsdWUubGVuZ3RoO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgICAgIHZhbHVlLnBpcGUoZnMuY3JlYXRlV3JpdGVTdHJlYW0oY2FjaGUubmFtZSkpXHJcbiAgICAgICAgICAgICAgICAgICAgLm9uKCdlcnJvcicsIHJlamVjdClcclxuICAgICAgICAgICAgICAgICAgICAub24oJ2Nsb3NlJywgcmVzb2x2ZSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgY29uc3Qgc3RhdHVzID0gYXdhaXQgZnMucHJvbWlzZXMuc3RhdChjYWNoZS5uYW1lKTtcclxuICAgICAgICAgICAgdGhpcy5fY3VycmVudFZvbHVtZSArPSBzdGF0dXMuc2l6ZSAtIGNhY2hlLnNpemU7XHJcbiAgICAgICAgICAgIGNhY2hlLnNpemUgPSBzdGF0dXMuc2l6ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICh0aGlzLl90aW1lb3V0ID4gMCkge1xyXG4gICAgICAgICAgICBjYWNoZS50aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5fY2FjaGVUYWJsZS5kZWxldGUoa2V5KTtcclxuICAgICAgICAgICAgICAgIGZzLnJlbW92ZShjYWNoZS5uYW1lLCBlcnIgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnIpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ+a4hemZpOe8k+WtmOW8guW4uO+8micsIGVycik7XHJcbiAgICAgICAgICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9jdXJyZW50Vm9sdW1lIC09IGNhY2hlLnNpemU7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfSwgdGhpcy5fdGltZW91dCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLl9jYWNoZVRhYmxlLmRlbGV0ZShrZXkpOyAgIC8v5Yi35paw57yT5a2Y5Zyo5YiX6KGo5Lit55qE5o6S5L2NXHJcbiAgICAgICAgdGhpcy5fY2FjaGVUYWJsZS5zZXQoa2V5LCBjYWNoZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDojrflj5bnvJPlrZhcclxuICAgICAqL1xyXG4gICAgYXN5bmMgZ2V0KGtleTogc3RyaW5nKTogUHJvbWlzZTxCdWZmZXIgfCB1bmRlZmluZWQ+IHtcclxuICAgICAgICBjb25zdCBjYWNoZSA9IHRoaXMuX2NhY2hlVGFibGUuZ2V0KGtleSk7XHJcblxyXG4gICAgICAgIGlmIChjYWNoZSkge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5fcmVmcmVzaFRpbWVvdXRXaGVuR2V0ICYmIHRoaXMuX3RpbWVvdXQgPiAwKSB7XHJcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQoY2FjaGUudGltZXIgYXMgYW55KTtcclxuICAgICAgICAgICAgICAgIGNhY2hlLnRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fY2FjaGVUYWJsZS5kZWxldGUoa2V5KTtcclxuICAgICAgICAgICAgICAgICAgICBmcy5yZW1vdmUoY2FjaGUubmFtZSwgZXJyID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGVycilcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ+a4hemZpOe8k+WtmOW8guW4uO+8micsIGVycik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2N1cnJlbnRWb2x1bWUgLT0gY2FjaGUuc2l6ZTtcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIH0sIHRoaXMuX3RpbWVvdXQpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICByZXR1cm4gYXdhaXQgZnMucmVhZEZpbGUoY2FjaGUubmFtZSk7XHJcbiAgICAgICAgfSBlbHNlXHJcbiAgICAgICAgICAgIHJldHVybiBjYWNoZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOS7pea1geeahOaWueW8j+iOt+WPlue8k+WtmFxyXG4gICAgICovXHJcbiAgICBnZXRTdHJlYW0oa2V5OiBzdHJpbmcpOiBOb2RlSlMuUmVhZGFibGVTdHJlYW0gfCB1bmRlZmluZWQge1xyXG4gICAgICAgIGNvbnN0IGNhY2hlID0gdGhpcy5fY2FjaGVUYWJsZS5nZXQoa2V5KTtcclxuXHJcbiAgICAgICAgaWYgKGNhY2hlKSB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLl9yZWZyZXNoVGltZW91dFdoZW5HZXQgJiYgdGhpcy5fdGltZW91dCA+IDApIHtcclxuICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dChjYWNoZS50aW1lciBhcyBhbnkpO1xyXG4gICAgICAgICAgICAgICAgY2FjaGUudGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9jYWNoZVRhYmxlLmRlbGV0ZShrZXkpO1xyXG4gICAgICAgICAgICAgICAgICAgIGZzLnJlbW92ZShjYWNoZS5uYW1lLCBlcnIgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXJyKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcign5riF6Zmk57yT5a2Y5byC5bi477yaJywgZXJyKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fY3VycmVudFZvbHVtZSAtPSBjYWNoZS5zaXplO1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfSwgdGhpcy5fdGltZW91dCk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHJldHVybiBmcy5jcmVhdGVSZWFkU3RyZWFtKGNhY2hlLm5hbWUpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHJldHVybiBjYWNoZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOWIpOaWree8k+WtmOaYr+WQpuWtmOWcqCBcclxuICAgICAqL1xyXG4gICAgaGFzKGtleTogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NhY2hlVGFibGUuaGFzKGtleSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDliKDpmaTnvJPlrZhcclxuICAgICAqL1xyXG4gICAgYXN5bmMgZGVsZXRlKGtleTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgY29uc3QgY2FjaGUgPSB0aGlzLl9jYWNoZVRhYmxlLmdldChrZXkpO1xyXG5cclxuICAgICAgICBpZiAoY2FjaGUpIHtcclxuICAgICAgICAgICAgYXdhaXQgZnMucmVtb3ZlKGNhY2hlLm5hbWUpO1xyXG4gICAgICAgICAgICB0aGlzLl9jYWNoZVRhYmxlLmRlbGV0ZShrZXkpO1xyXG4gICAgICAgICAgICBjbGVhclRpbWVvdXQoY2FjaGUudGltZXIgYXMgYW55KTtcclxuICAgICAgICAgICAgdGhpcy5fY3VycmVudFZvbHVtZSAtPSBjYWNoZS5zaXplO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIOa4heepuue8k+WtmFxyXG4gICAgICovXHJcbiAgICBhc3luYyBlbXB0eSgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiB0aGlzLl9jYWNoZVRhYmxlKSB7XHJcbiAgICAgICAgICAgIGF3YWl0IGZzLnJlbW92ZSh2YWx1ZS5uYW1lKTtcclxuICAgICAgICAgICAgdGhpcy5fY2FjaGVUYWJsZS5kZWxldGUoa2V5KTtcclxuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHZhbHVlLnRpbWVyIGFzIGFueSk7XHJcbiAgICAgICAgICAgIHRoaXMuX2N1cnJlbnRWb2x1bWUgLT0gdmFsdWUuc2l6ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDplIDmr4HnvJPlrZhcclxuICAgICAqL1xyXG4gICAgYXN5bmMgZGVzdHJveSgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBhd2FpdCB0aGlzLmVtcHR5KCk7XHJcbiAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLl9jbGVhbmVyVGltZXIpO1xyXG4gICAgfVxyXG59Il19