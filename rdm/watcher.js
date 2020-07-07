const Bluebird = require('bluebird')
const fs = require('fs-extra-promise').usePromise(Bluebird)
//
const CONST = {
    PUBLIC_ROOT: '../../fdm', // flat file apache
    // STRUCTURE_SERVE_PUBLIC: '/config/structure.en.json',
    // TRANSLATIONS_SERVE_PUBLIC: '/config/translations.en.json',
    // MEDIA_SERVE_PUBLIC: '/media/',
    INDEX_PUBLIC: '/index.html'
}
const run = async () => {
    setInterval(() => {
        fs.stat(`${CONST.PUBLIC_ROOT}${CONST.INDEX_PUBLIC}`, (error, stats) => {
            if (error) {
                console.log('ST:  error = ', error)
            } else {
                console.log('ST:  stats.atimeMs = ', stats.atimeMs)

                // Using methods of the Stats object
                //   console.log("Path is file:", stats.isFile());
                //   console.log("Path is directory:", stats.isDirectory());
            }
        })
    }, 1000)
}

console.log('obj:fc file = ', `${CONST.PUBLIC_ROOT}${CONST.INDEX_PUBLIC}`)

fs.stat(`${CONST.PUBLIC_ROOT}${CONST.INDEX_PUBLIC}`, (error, stats) => {
    if (error) {
        console.log('ST:  error = ', error)
    } else {
        console.log('ST:  stats.atimeMs = ', stats.atimeMs)

        // Using methods of the Stats object
        //   console.log("Path is file:", stats.isFile());
        //   console.log("Path is directory:", stats.isDirectory());
    }
})

fs.watchFile(`${CONST.PUBLIC_ROOT}${CONST.INDEX_PUBLIC}`, (curr, prev) => {
    console.log(`watchFile: ${curr}`)
    console.log(`watchFile: ${prev}`)
})

fs.watch(`${CONST.PUBLIC_ROOT}${CONST.INDEX_PUBLIC}`, (curr, prev) => {
    console.log(`watch: ${curr}`)
    console.log(`watch: ${prev}`)
})


// run()
