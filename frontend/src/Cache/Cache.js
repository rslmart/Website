const setup2dArray = (height, width) => {
    const arr = new Array(height);
    for (let i = 0; i < arr.length; i++) {
        arr[i] = new Array(width);
        for (let j = 0; j < arr[i].length; j++) {
            arr[i][j] = 0;
        }
    }
    return arr;
};

/**
 * Representation of a one level cache. Relies on 3d array "this.cache" to hold value.
 * "this.metaCache" holds information for choosing replacement.
 */
class Cache {
    /**
     * Constructor
     * @param cacheAlg algorithm the cache will use for replacement
     * @param cacheSize size of the cache in bytes
     * @param ways usually a power of 2
     */
    constructor(cacheAlg, cacheSize, ways) {
        this.cacheAlg = cacheAlg;
        this.cacheSize = cacheSize;
        this.ways = ways;
        this.blockSize = Math.floor(64/8); // 64 bits, 8 bits per byte
        this.addressSize = Math.floor(48 / 8); // bytes
        this.lamba = 0.5; // 0=>LFU 1=>LRU
        this.setSize = Math.floor((this.cacheSize / this.blockSize) / this.ways);
        this.blockBits = Math.floor(Math.log2(this.blockSize));
        this.setBits = Math.floor(Math.log2(this.setSize));
        this.cache = new Array(this.setSize);

        for (let i = 0; i < this.cache.length; i++) {
            this.cache[i] = new Array(this.ways);
            for (let j = 0; j < this.cache[i].length; j++) {
                this.cache[i][j] = new Array(this.blockSize);
                for (let k = 0; k < this.cache[i][j].length; k++) {
                    this.cache[i][j][k] = 0;
                }
            }
        }

        if (cacheAlg === 'LFU' || cacheAlg === 'MFU' || cacheAlg === 'LRU2') {
            this.metaCache2 = setup2dArray(this.setSize, this.ways);
        }
        if (cacheAlg === 'LRFU') {
            this.metaCache = setup2dArray(this.setSize, this.ways);
        } else {
            this.metaCache = setup2dArray(this.setSize, this.ways);
        }
        this.setCache = new Array(this.setSize).fill(0);
        this.wayCache = setup2dArray(this.setSize, this.ways);

        this.blockMask = parseInt(new Array(this.blockBits).fill('1').join(''), 2);
        this.setMask = parseInt(new Array(this.setBits).fill('1').join(''), 2);
        
        this.hit = 0;
        this.miss = 0;
    }

    /**
     * Search through cache for address
     * @param address memory address from trace
     * @returns boolean if found otherwise False
     */
    find(address) {
        const setNum = (address >> this.setBits) & this.setMask;
        const tag = (address >> this.setBits) >> this.blockBits;

        this.setCache[setNum] += 1;

        for (let w = 0; w < this.cache[setNum].length; w++) {
            this.cache[setNum][w].forEach(b => {
                if (tag === b) {
                    this.hit += 1;
                    if (this.cacheAlg === 'LRU' || this.cacheAlg === 'MRU') {
                        this.metaCache[setNum][w] = this.hit + this.miss;
                    } else if (this.cacheAlg === 'LRU2') {
                        // store second most recent timestamp
                        this.metaCache2[setNum][w] = this.metaCache[setNum][w];
                        this.metaCache[setNum][w] = this.hit + this.miss;
                    } else if (this.cacheAlg === 'LFU' || this.cacheAlg === 'MFU') {
                        this.metaCache[setNum][w] += 1;
                    } else if (this.cacheAlg === 'FIFO' || this.cacheAlg === 'LIFO') {
                        this.metaCache[setNum][w] = Math.max(this.metaCache[setNum]) + 1;
                    } else if (this.cacheAlg === 'PLRU') {
                        this.metaCache[setNum][0] = (this.metaCache[setNum][0] + 1) % this.ways;
                    } else if (this.cacheAlg === 'LRFU') {
                        for (let i = 0; i < this.metaCache[setNum].length; i++) {
                            if (this.cache[setNum][i][0] !== 0 && i !== w) {
                                this.metaCache[setNum][i] = (2 ** (-1 * this.lamba)) * this.metaCache[setNum][i];
                            } else {
                                this.metaCache[setNum][i] = 1 + (2 ** (-1 * this.lamba)) * this.metaCache[setNum][i];
                            }
                        }
                    }
                    return true;
                }
            })
        }
        return false;
    }

    /**
     * Load data into the cache based off cache alg
     * @param address memory address from trace
     */
    load(address) {
        const setNum = (address >> this.setBits) & this.setMask;
        const tag = (address >> this.setBits) >> this.blockBits;
        this.miss += 1;
        let w = -1;
        for (let i = 0; i < this.ways; i++) {
            if (this.cache[setNum][i][0] === 0) {
                w = i;
            }
        }
        if (w === -1) {
            if (this.cacheAlg === 'R') {
                w = Math.floor(Math.random() * this.cache[setNum].length);
            } else if (this.cacheAlg === 'LRU' || this.cacheAlg === 'LIFO' || this.cacheAlg === 'LRFU') {
                w = Math.min(this.metaCache[setNum]);
            } else if (this.cacheAlg === 'LRU2') {
                w = Math.min(this.metaCache2[setNum]);
            } else if (this.cacheAlg === 'MRU' || this.cacheAlg === 'FIFO') {
                w = Math.max(this.metaCache[setNum]);
            } else if (this.cacheAlg === 'LFU') {
                // if there are multiple values decide by LRU
                const minVal = this.metaCache[setNum].min();
                const x = [];
                // Get all indices of values matching the minimum value
                this.metaCache[setNum].reduce((a, e, i) => e === minVal ? a.push(i) : a, []);
                w = x[0];
                for (let y = 0; y < x.length; y++) {
                    if (this.metaCache2[setNum][x[y]] < this.metaCache2[setNum][w]) {
                        w = x[y];
                    }
                }
            } else if (this.cacheAlg === 'MFU') {
                // if there are multiple values decide by MRU
                const maxVal = this.metaCache[setNum].max();
                const x = [];
                // Get all indices of values matching the maximum value
                this.metaCache[setNum].reduce((a, e, i) => e === maxVal ? a.push(i) : a, []);
                w = x[0];
                for (let y = 0; y < x.length; y++) {
                    if (this.metaCache2[setNum][x[y]] < this.metaCache2[setNum][w]) {
                        w = x[y];
                    }
                }
            } else if (this.cacheAlg === 'PLRU') {
                w = this.metaCache[setNum][0]
            }
        }
        if (this.cacheAlg === 'LRU' || this.cacheAlg === 'MRU') {
            this.metaCache[setNum][w] = this.hit + this.miss;
        } else if (this.cacheAlg === 'LRU2') {
            this.metaCache2[setNum][w] = this.hit + this.miss;
            this.metaCache[setNum][w] = this.hit + this.miss;
        } else if (this.cacheAlg === 'LFU' || this.cacheAlg === 'MFU') {
            this.metaCache[setNum][w] = 1;
            this.metaCache2[setNum][w] = this.hit + this.miss;
        } else if (this.cacheAlg === 'LIFO' || this.cacheAlg === 'FIFO') {
            this.metaCache[setNum][w] = Math.max(this.metaCache[setNum]) + 1;
        } else if (this.cacheAlg === 'PLRU') {
            this.metaCache[setNum][w] = 0;
        } else if (this.cacheAlg === 'LRFU') {
            for (let i = 0; i < this.metaCache[setNum].length; i++) {
                if (i != w) {
                    this.metaCache[setNum][i] = (2 ** (-1 * this.lamba)) * this.metaCache[setNum][i];
                } else {
                    this.metaCache[setNum][i] = 0;
                }
            }
        }
        this.wayCache[setNum][w] += 1;
        for (let b = 0; b < this.cache[setNum][w].length; b++) {
            this.cache[setNum][w][b] = tag
        }
    }
}