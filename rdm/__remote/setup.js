this.config = {
    devMode: false,
    syncPublic: false,
    useHttp: false,
    http: {
        // possible ports: 80, 8080
        port: '8080'
    },
    https: {
        // possible ports: 443, 8443
        port: '8443'
    },
    CONST: {
        PUBLIC_ROOT: '../../fdm', // flat file apache target
        STRUCTURE_SERVE_PUBLIC: '/config/structure.en.json',
        TRANSLATIONS_SERVE_PUBLIC: '/config/translations.en.json',
        MEDIA_SERVE_PUBLIC: '/media/',
        INDEX_PUBLIC: '/index.html'
    }
}
