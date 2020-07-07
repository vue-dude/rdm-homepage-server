this.config = {
    devMode: false,
    syncPublic: false,
    useHttp: false,
    http: {
        host: '127.0.0.1',
        port: '8082'
    },
    https: {
        host: '127.0.0.1',
        port: '3000',
        cert: '../rdm/cert/cert.pem',
        key: '../rdm/cert/key.pem',
        pw: '../rdm/cert/pw.pem'
    },
    CONSTXX: {
        PUBLIC_ROOT: '../../fdm', // flat file apache
        STRUCTURE_SERVE_PUBLIC: '/config/structure.en.json',
        TRANSLATIONS_SERVE_PUBLIC: '/config/translations.en.json',
        MEDIA_SERVE_PUBLIC: '/media/',
        INDEX_PUBLIC: '/index.html'
    },
    CONST: {
        PUBLIC_ROOT: null // self
    }
}
