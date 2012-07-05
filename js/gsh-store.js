var drawer = drawer || {};

drawer.Item = {};
drawer.Item.create = function (itemdata) {
    var item = {};
    for (p in itemdata) {
        if (itemdata.hasOwnProperty(p)) {
            item[p] = itemdata[p];
        }
    }

    if (!item.name)
        throw new Error("An Item must have at least a name property");
    return item;
};

drawer.Item.createFromFreebaseHint = function (fbase_res) {
    if (fbase_res["fbase:id"]) return fbase_res;
    else return drawer.Item.create({
        "fbase:id":fbase_res.id,
        name:fbase_res.name,
        imageUrl:'https://usercontent.googleapis.com/freebase/v1/image' + fbase_res.id
    });
};


/* storage & persistence*/
drawer.store = {};

drawer.store.DB = rdfstore.create({persistent:true, name:'drawer', overwrite:false}, function () {
});
drawer.store.DB.registerDefaultProfileNamespaces();

drawer.store.clear = function (db, cb) {
    db.clear(function (success) {
        if (success) {
            console.log("Successfully cleared the store.");
            cb(success);
        } else {
            console.log("Error while clearing the store.");
        }
    });
};

drawer.store.insertJSONLD = function (store, item, cb) {
    store.load("application/ld+json", item,
        function (success, results) {
            if (success === true) {
                console.log("Successfully added " + item["name"]);
                cb(item);
            } else {
                console.log("Error while inserting " + item["name"]);
            }
        });
};

drawer.store.addItem = function (store, /* item as jsonld */ item, cb) {
    // add GoodRelations ns
    item["@context"] = item["@context"] || {};
    item["@context"]["gr"] = "http://purl.org/goodrelations/v1#";
    item["@context"]["name"] = "http://purl.org/goodrelations/v1#name";
    item["@context"]["imageUrl"] = "http://xmlns.com/foaf/0.1/depiction";
    item["@context"]["fbase"] = "http://www.freebase.com/id/";
    item["@id"] = (new Date()).getTime() + "" + Math.floor(Math.random() * 100);

    if (!item["@type"]) {
        item["@type"] = [ ];
    } else {
        item["@type"] = [ item["@type"] ];
    }

    // add GoodRelation base type
    item["@type"].push("gr:ProductOrService");

    // record time when it was added (UTC)
    item["xventory:added"] = (new Date()).getTime();

    drawer.store.insertJSONLD(store, item, cb);
};

drawer.store.getItems = function (store, cb) {
    store.execute(drawer.query.allItemsFromStoreSparql, cb);
};

drawer.store.loadIntoTempStore = function (/* Page URL */ url) {
    // use rdf-translator.appspot.com for extraction into n3
    var rdfTr2N3Url = "http://rdf-translator.appspot.com/convert/detect/n3/";

    $.get(rdfTr2N3Url + encodeURIComponent(url), function (data) {
        rdfstore.create({persistent:false, name:'temp', overwrite:true}, function (store) {
            store.load("text/n3", data, function (success, results) {
            })
        });
    });
};

drawer.query = drawer.query || { };

drawer.query.allItemsFromStoreSparql = "PREFIX gr: <http://purl.org/goodrelations/v1#> \
                                        PREFIX foaf: <http://xmlns.com/foaf/0.1/> \
                                        SELECT ?name ?imageUrl WHERE { ?p a gr:ProductOrService. \
                                                                 ?p gr:name ?name. \
                                                                 OPTIONAL \
                                                                 { ?p foaf:depiction ?imageUrl } }";

drawer.query.allItemsFromPageSparql = "PREFIX gr: <http://purl.org/goodrelations/v1#> \
                                       PREFIX foaf: <http://xmlns.com/foaf/0.1/> \
                                       SELECT ?name ?imageUrl WHERE { { ?p a gr:ProductOrService } UNION { ?p a gr:SomeItems } UNION { ?p a gr:Individual } \
                                                         ?p gr:name ?name.\
                                                         OPTIONAL { ?p foaf:depiction ?imageUrl }}";