const loadFlag = flag => {
    try {
        const data = require(`../rdm/config/options/${flag}`)
        if (flag === 'secretIndex') {
            config.CONST.INDEX_PUBLIC = data.value
        } else {
            config[flag] = true
        }
    } catch (e) {}
}

const express = require('express')
const cors = require('cors')
const Bluebird = require('bluebird')
const fs = require('fs-extra-promise').usePromise(Bluebird)
const https = require('https')
const http = require('http')
const _ = require('lodash')
var Fingerprint = require('express-fingerprint')
const bodyParser = require('body-parser')
const getBps = () => bodyParser.json({ limit: '1mb', extended: true })
const storage = require('../src/node-persist.js')
const CryptoJsMD5 = require('crypto-js/md5')
let auth = require('../rdm/auth-store/auth.json')
//
const config = require('../rdm/config/setup.js').config
_.each('devMode,syncPublic,useHttp,secretIndex'.split(','), flag => loadFlag(flag))
console.log('CMS: config = ', config)
//
const DEV_MODE = config.devMode === true
const SYNC_PUBLIC = config.syncPublic === true
//
let app = null
let adminActive = false

//
const CONST = {
    STRUCTURE_STATIC_PUBLISHED: '../rdm/_now/content-static/structure-published.en.json',
    STRUCTURE_STATIC_PREVIEW: '../rdm/_now/content-static/structure-preview.en.json',
    TRANSLATIONS_STATIC: '../rdm/_now/content-static/translations.en.json',
    STRUCTURE_SERVE: '../rdm/_now/content-serve/structure.en.json',
    TRANSLATIONS_SERVE: '../rdm/_now/content-serve/translations.en.json',
    // this is copied to the public server if SYNC_PUBLIC === true !
    FLATFILES : '_flatfiles',
    PUBLIC_ROOT: config.CONST.PUBLIC_ROOT || '_flatfiles',
    STRUCTURE_SERVE_PUBLIC: config.CONST.STRUCTURE_SERVE_PUBLIC || '/config/structure.en.json',
    TRANSLATIONS_SERVE_PUBLIC: config.CONST.TRANSLATIONS_SERVE_PUBLIC || '/config/translations.en.json',
    MEDIA_SERVE_PUBLIC: config.CONST.MEDIA_SERVE_PUBLIC || '/media/',
    INDEX_PUBLIC: config.CONST.INDEX_PUBLIC || '/idx.html',
    //
    STRUCTURE_PREVIEW: '../rdm/_now/content-preview/structure.en.json',
    TRANSLATIONS_PREVIEW: '../rdm/_now/content-preview/translations.en.json',
    MEDIA_SERVE: '../rdm/_now/media-serve',
    BACKUPS: '../rdm/_backups',
    STATIC: '../rdm/_now/content-static',
    STORE: '../rdm/_now/cms-store',
    T: 'QWERTZUPLKHGFDSAYXCVBNM123456789'.split('')
}

const getToken = length => {
    const token = []
    while (--length >= -1) {
        token.push(_.sample(CONST.T))
    }
    return token.join('')
}

const getAdminById = id => {
    return auth[auth[id]] || null
}

const fingerprintConfig = {
    parameters: [Fingerprint.useragent, Fingerprint.acceptHeaders, Fingerprint.geoip]
}

const addToStoreMultiple = async (data, options = {}) => {
    _.each(data, item => {
        item.key = options.preview ? `00.${item.key}` : item.key
        storage.set(item.key, item.value)
    })
}

const removeFromStoreMultiple = async keys => {
    _.each(keys, key => {
        storage.removeItem(key)
    })
}

const backupCurrentVersion = async keys => {
    // no summer/winter time supported here!
    const date = new Date()
        .toISOString()
        .split(':')
        .join('-')
        .split('T')
        .join('--')
        .split('.')[0]
    const backupTarget = `${CONST.BACKUPS}/${date}`

    await fs.mkdirAsync(backupTarget)
    await fs.copyAsync(CONST.STATIC, `${backupTarget}/${CONST.STATIC.split('/').pop()}`)
    await fs.copyAsync(CONST.STORE, `${backupTarget}/${CONST.STORE.split('/').pop()}`)
    await fs.copyAsync(CONST.MEDIA_SERVE, `${backupTarget}/${CONST.MEDIA_SERVE.split('/').pop()}`)
}

const publishChanges = async () => {
    const values = await storage.data()
    // console.log('CMS:publishChanges values = ', values)
    const keysToRemove = []
    const itemsToPublish = []
    _.each(values, item => {
        const key = item.key.split('.')
        if (key[0] === '00') {
            keysToRemove.push(key.join('.'))
            key.shift()
            item.key = key.join('.')
            item.value = item.value.split('src="/media/00/').join('src="/media/')
            itemsToPublish.push(item)
        }
    })
    publishImages()
    addToStoreMultiple(itemsToPublish)
    removeFromStoreMultiple(keysToRemove)
    await updateTranslations({ publishMode: true })
}

const renameUnpublishedMedia = () => {
    return new Promise(resolve => {
        fs.readdirAsync(CONST.MEDIA_SERVE, (err, fileNames) => {
            const queue = {}
            _.each(fileNames, key => (key.substr(0, 3) === '00.' ? (queue[key] = key) : null))
            const done = key => {
                delete queue[key]
                if (Object.keys(queue).length <= 0) {
                    resolve()
                }
            }
            _.each(queue, fileName => {
                const key = fileName.split('.')
                key.shift()
                fs.renameAsync(`${CONST.MEDIA_SERVE}/${fileName}`, `${CONST.MEDIA_SERVE}/${key.join('.')}`)
                    .then(done.bind(this, fileName))
                    .catch(done.bind(this, fileName))
            })
        })
    })
}

const updatePublicMedia = async () => {
    const target = `${CONST.PUBLIC_ROOT}${CONST.MEDIA_SERVE_PUBLIC}`
    try {
        // this catches the (node:12601) ENOTEMPTY: directory not empty bug
        await fs.emptydirSync(target)
    } catch (error) {
        //
    }
    await new Promise(resolve => setTimeout(resolve, 100))
    fs.readdirAsync(CONST.MEDIA_SERVE, (err, fileNames) => {
        // console.log('updatePublicMedia:readdirAsync fileNames = ', fileNames)
        fileNames.forEach(fileName => {
            const sc = `${CONST.MEDIA_SERVE}/${fileName}`
            let path = fileName.split('.')
            const fn = [path.pop(), path.pop()].reverse().join('.')
            path.push(fn)
            path = path.join('/')
            const tg = `${target}${path}`
            fs.copySync(sc, tg)
        })
    })
}

const publishImages = async () => {
    await renameUnpublishedMedia()
    SYNC_PUBLIC ? updatePublicMedia() : null
}

const updateTranslation = (item, trns) => {
    const datagroup = item.key.split('.')[1]
    const canAddNewKey = datagroup === 'content' || datagroup === 'nav'
    if (canAddNewKey || !_.isUndefined(_.get(trns, item.key))) {
        _.set(trns, item.key, item.value)
    }
}

const updateTranslations = async (options = {}) => {
    // const lang = options.lang || 'en'
    options.previewMode = options.previewMode ? true : false
    options.publishMode = options.publishMode ? true : false
    options.initMode = options.initMode ? true : false
    if (options.publishMode || options.initMode) {
        options.previewMode = false
    }

    let trns = await fs.readFileAsync(CONST.TRANSLATIONS_STATIC)
    trns = JSON.parse(trns)
    const values = await storage.data()
    const previews = []
    _.each(values, item => {
        const key = item.key.split('.')
        if (key[0] === '00') {
            key.shift()
            item.key = key.join('.')
            previews.push(item)
        } else {
            updateTranslation(item, trns)
        }
    })

    let targets = [CONST.TRANSLATIONS_SERVE]
    if (SYNC_PUBLIC) {
        targets.push(`${CONST.PUBLIC_ROOT}${CONST.TRANSLATIONS_SERVE_PUBLIC}`)
    }
    if (options.previewMode) {
        targets = [CONST.TRANSLATIONS_PREVIEW]
        _.each(previews, item => {
            updateTranslation(item, trns)
        })
    }
    if (options.publishMode || options.initMode) {
        targets.push(CONST.TRANSLATIONS_PREVIEW)
    }
    _.each(targets, target => {
        const str = JSON.stringify(trns, null, 4)
        fs.writeFile(target, str, err =>
            err ? console.log('Translations update error!', err) : console.log('Translations update successful!')
        )
    })
    return trns
}

const updateStructure = async () => {
    const sources = [CONST.STRUCTURE_STATIC_PUBLISHED, CONST.STRUCTURE_STATIC_PREVIEW]
    const targets = [CONST.STRUCTURE_SERVE, CONST.STRUCTURE_PREVIEW]
    if (SYNC_PUBLIC) {
        sources.push(CONST.STRUCTURE_STATIC_PUBLISHED)
        targets.push(`${CONST.PUBLIC_ROOT}${CONST.STRUCTURE_SERVE_PUBLIC}`)
    }
    // TODO find easy loop-based solution for this!
    // _.each(sources, async (src, index) ... don't works
    // const load = async () => { ... don't works, neither await or promise version
    sources[0] = await fs.readFileAsync(sources[0])
    sources[1] = await fs.readFileAsync(sources[1])
    sources[2] ? (sources[2] = await fs.readFileAsync(sources[2])) : null
    //
    _.each(targets, (d, index) => {
        fs.writeFile(targets[index], sources[index], err =>
            err ? console.log('Structure update error!', err) : console.log('Structure update successful!')
        )
    })
}

const initData = async () => {
    await storage.init({
        logging: true,
        ttl: null,
        dir: CONST.STORE,
        encoding: 'utf8'
    })

    _.each(auth, (item, key) => {
        auth[key] = {
            id: getToken(8),
            hash: null,
            timestamp: null,
            token: null
        }
        auth[auth[key].id] = key
    })
    // overwriting the getDatumPath, using key alao as storage key
    // instead of md5 for easier handling
    const path = require('path')
    const persist = storage.defaultInstance
    persist.getDatumPath = function(key) {
        return path.join(this.options.dir, `${key}.json`)
    }.bind(persist)
    // ----
    // TODO bodyParser app.use dont works, find out why
    // app.use(bodyParser.json({ limit: '2mb', extended: true }))
    // ----
    await updateStructure()
    await updateTranslations({ initMode: true })
}

const createServer = async () => {
    app = express()
    app.use(cors())
    app.use(Fingerprint(fingerprintConfig))

    app.post('/authenticate', getBps(), async (req, res) => {
        // console.log('CMS:authenticate req.body = ', req.body)
        const admin = auth[req.body.email]
        const result = { success: false }
        if (admin) {
            admin.hash = req.fingerprint.hash
            admin.token = getToken(20)
            const link = `/auth-confirm/${admin.id}-${admin.token}`
            // console.log('CMS:get/authenticate link = ', link)
            result.success = true
            if (DEV_MODE) {
                keepAliveAdminSession(admin)
                result.devMode = true
                result.link = link // TEST ON !!
                result.token = `${admin.id}-${admin.token}`
            } else {
                // TODO implement auth confirm mail send here
            }
        }
        res.send(result)
    })

    const validateAdminByRequestData = (hsh, tkn) => {
        if (!_.isString(hsh) || !_.isString(tkn)) {
            return null
        }
        const token = tkn.split('-')
        const admin = getAdminById(token[0])
        return admin && admin.token === token[1] && hsh === admin.hash
    }

    const keepAliveAdminSession = admin => {
        admin.timestamp = Date.now()
        adminActive = true
    }

    const checkAndResetAdminSessions = () => {
        // TODO implement admin timeout and reset
    }

    app.post('/auth-confirm', getBps(), async (req, res) => {
        const result = { success: false }
        const admin = validateAdminByRequestData(req.fingerprint.hash, req.body.token)
        if (admin) {
            keepAliveAdminSession(admin)
            result.success = true
        }
        res.send(result)
    })

    app.post('/update', getBps(), async (req, res) => {
        const admin = validateAdminByRequestData(req.fingerprint.hash, req.body.token)
        if (admin) {
            keepAliveAdminSession(admin)
            await addToStoreMultiple(req.body.data, { preview: true })
            const trns = await updateTranslations({ previewMode: true })
            res.send(trns)
        } else {
            res.send(null)
        }
    })

    const sanitizeFilename = input => {
        const allowedEndings = {
            jpeg: true,
            jpg: true,
            png: true,
            gif: true,
            webp: true
        }
        const regx = new RegExp('^[a-zA-Z0-9()_.-]+$', 'g')
        const fn = input.split('.')
        const postfix = fn.pop()
        let prefix = fn.length > 0 ? fn.join('-') : ''
        const isUsable = !allowedEndings[postfix.toLowerCase()] || prefix === '' ? false : true
        const isMd5ed = !regx.test(prefix)
        prefix = isMd5ed ? CryptoJsMD5(prefix).toString() : prefix
        return {
            raw: input,
            prefix,
            postfix,
            processedName: prefix === '' ? postfix : `${prefix}.${postfix}`,
            isUsable,
            isMd5ed
        }
    }

    const sanitizeKey = key => {
        const regx = new RegExp('^[a-zA-Z0-9()_.-]+$', 'g')
        const isValid = regx.test(key)
        return {
            key,
            isValid
        }
    }

    app.post('/upload', getBps(), async (req, res) => {
        const admin = validateAdminByRequestData(req.fingerprint.hash, req.body.token)
        if (admin) {
            // console.log('upload: req.body.key = ', req.body.key)
            if (!sanitizeKey(req.body.key).isValid) {
                return res.send({ success: false, error: `error in key:  "${req.body.key}"` })
            }
            const fn = sanitizeFilename(req.body.fileName)
            if (!fn.isUsable) {
                return res.send({ success: false, error: `error in filename:  "${req.body.fileName}"` })
            }
            const key = req.body.key
            const filename = fn.processedName
            const name = `${key}.${filename}`
            const previewKey = '00'
            const savePath = `${CONST.MEDIA_SERVE}/${previewKey}.${name}`
            req.body.base64 = req.body.base64.split(';base64,').pop()
            fs.writeFileAsync(savePath, req.body.base64, { encoding: 'base64' })
                .then(() => res.send({ success: true, key, previewKey, filename })) // Do something with the content
                .catch(err => {
                    res.send({ success: false, error: err })
                })
        } else {
            res.send({ success: false })
        }
    })

    app.post('/publish', getBps(), async (req, res) => {
        const admin = validateAdminByRequestData(req.fingerprint.hash, req.body.token)
        if (admin) {
            keepAliveAdminSession(admin)
            await backupCurrentVersion()
            await publishChanges()
            const result = { success: true }
            res.send(result)
        } else {
            res.send(null)
        }
    })

    app.post('/structure', getBps(), async (req, res) => {
        let data = await fs.readFileAsync(CONST.STRUCTURE_SERVE)
        if (adminActive) {
            const admin = validateAdminByRequestData(req.fingerprint.hash, req.body.token)
            // console.log('CMS:structure admin = ', admin)
            if (admin) {
                // currently no structure edit is available,
            }
        }
        res.send(data)
    })

    app.post('/translations', getBps(), async (req, res) => {
        let data = await fs.readFileAsync(CONST.TRANSLATIONS_SERVE)
        if (adminActive) {
            const admin = validateAdminByRequestData(req.fingerprint.hash, req.body.token)
            if (admin) {
                data = await fs.readFileAsync(CONST.TRANSLATIONS_PREVIEW)
            }
        }
        res.send(data)
    })

    app.get('/*', async (req, res) => {
        const path = req.url.split('/')
        subpath = req.url
        let source = ''
        switch (path[1]) {
            case '':
            case 'start':
            case 'index':
            case 'home':
                source = `${CONST.PUBLIC_ROOT}${CONST.INDEX_PUBLIC}`
                break
            case 'media':
                source = resolveMediaPath(subpath) // images get loaded from cms
                break
            default:
                if (DEV_MODE && CONST.PUBLIC_ROOT === CONST.FLATFILES) {
                    // special, enables easy get of structure and translations (dev-mode)
                    source = subpath === '/structure' ? CONST.STRUCTURE_SERVE : ''
                    source = subpath === '/translations' ? CONST.TRANSLATIONS_SERVE : source
                } else {
                    // all other files (website) loaded from public root
                    source = `${CONST.PUBLIC_ROOT}${subpath}`
                }

        }
        let file = fs.createReadStream(source)
        file.on('error', () => (file = null))
        if (file) {
            res.setHeader('Content-Type', getMimeByEnding(source.split('.').pop()))
            file.pipe(res)
        }
    })

    const resolveMediaPath = url => {
        const path = url.split('/')
        while (path.length > 0) {
            const p = path.shift()
            if (p === 'media') {
                break
            }
        }
        return `${CONST.MEDIA_SERVE}/${path.join('.')}`
    }

    const getMimeByEnding = (ending = '') => {
        const mimes = {
            jpeg: 'image/jpg',
            jpg: 'image/jpg',
            png: 'image/png',
            gif: 'image/gif',
            htm: 'text/html',
            html: 'text/html',
            js: 'text/javascript',
            css: 'text/css',
            json: 'application/json'
        }
        return mimes[ending.toLowerCase()] || 'text/plain'
    }
}

const startServer = async () => {
    if (config.useHttp) {
        http.createServer({}, app).listen(config.http.port, () =>
            console.log(`rdm server listening on http / port ${config.http.port}!`)
        )
    } else {
        const options = {}
        options.cert = await fs.readFileAsync(config.https.cert)
        options.key = await fs.readFileAsync(config.https.key)
        try {
            options.passphrase = await fs.readFileAsync(config.https.pw, 'utf8')
        } catch (error) {
            //
        }
        https
            .createServer(options, app)
            .listen(config.https.port, () => console.log(`rdm server listening on https / port ${config.https.port}!`))
    }
}

const getMediaUrlsFromRawData = data => {
    let str = _.isPlainObject(data) ? JSON.stringify(data) : data
    str = str.split('\\').join('')
    const l1 = str.split('src="/media/')
    l1.shift()
    const res = {}
    _.each(l1, str => {
        str = str.split('"')[0]
        res[str] = str
    })
    return res
}

const cleanupMediaFiles = async () => {
    // get all used media from the translations
    const trns1 = await updateTranslations({ previewMode: false })
    let res1 = getMediaUrlsFromRawData(trns1)
    // TODO check why directly load preview translations sometimes dont work (missing 00. images)
    const trns2 = await updateTranslations({ previewMode: true })
    let res2 = getMediaUrlsFromRawData(trns2)
    let res = { ...res1, ...res2 }
    // the following enables to set a fallback jpeg for a webp image,
    // which get copied even if its not directly linked in the content!
    const fallbackJpegz = {}
    _.each(res, value => {
        let l1 = value.split('.')
        if (l1.pop() === 'webp') {
            l1.push('jpg')
            const jpg = l1.join('.')
            fallbackJpegz[jpg] = jpg
        }
    })
    res = { ...res, ...fallbackJpegz }
    //
    await fs.removeAsync(`${CONST.MEDIA_SERVE}-unused`).catch(() => null)
    await fs.renameAsync(CONST.MEDIA_SERVE, `${CONST.MEDIA_SERVE}-unused`).catch(() => null)
    await fs.mkdirAsync(CONST.MEDIA_SERVE).catch(() => null)
    // move all used media back to the MEDIA_SERVE folder
    console.log('cleanupMediaFiles: used queue: res = ', res)
    _.each(res, fileName => {
        fileName = fileName.split('/').join('.')
        fs.renameAsync(`${CONST.MEDIA_SERVE}-unused/${fileName}`, `${CONST.MEDIA_SERVE}/${fileName}`).catch(() => null)
    })
    SYNC_PUBLIC ? updatePublicMedia() : null
}

const run = async () => {
    await initData()
    await cleanupMediaFiles()
    createServer()
    startServer()
    // publishChanges() // TEST ON
}

run()
