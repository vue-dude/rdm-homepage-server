#rdm-frontend-server
## provides a generic CMS backend for the RDM Homepage
## based on node-persist, a database-free flatfile storage library

## Run the server:
 ```sh
$ cd rdm
$ node rdm.js
```
## To run the frontend with this server instead of its own flatfiles (local):
On rdm-homepage/public/config/setup.js, set 
window.BASE_CONFIG = configCms
( which points to http://127.0.0.1:8082 in default configuration )
