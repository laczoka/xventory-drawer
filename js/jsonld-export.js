var rdfexport = rdfexport || {};

rdfexport.jsonld = (function() {

    function toOwnershipRec(item, genId) {
        var oi = {
            "@id": "_:b"+(item['_id'] || genId()),
            "@type" : "s:OwnershipInfo",
            "s:typeOfGood": {
                "@id": "_:b"+genId(),
                "@type": ["gr:ProductOrService",
                          "s:Product"]
            } };

        if (item['acquiredFrom'] && (item['acquiredFrom']['name'] || item['acquiredFrom']['url'])) {
            oi['s:acquiredFrom'] = { "@id" : "_:b"+Math.floor(Math.random()*100000000000000),
                                     "@type" : ["gr:BusinessEntity", "s:Organization"]};
            var be = oi['s:acquiredFrom'];

            if (item.acquiredFrom['name']) {
                be.name = item.acquiredFrom.name;
            }
            if (item.acquiredFrom['url']) {
                be.url = item.acquiredFrom.url;
            }
        }

        _.each(['ownedFrom', 'ownedThrough'], function(pp) {
            if (item[pp] && (new Date(item[pp]))) {
                var d = new Date(item[pp]);
                var datestr = d.getFullYear()+"-"+ (d.getMonth()+1) + "-" + d.getDate() +"T"+"00:00:00";
                oi["s:"+pp] = { "@type": "xsd:dateTime", "@value": datestr }
            }});

        var p = oi["s:typeOfGood"];

        _.each(["name", "url", "image", "gtin8", "gtin13", "gtin14"],
            function(pp) {
                if (item[pp] && item[pp]['length'] && item[pp].length > 0) {
                    p["s:"+pp] = item[pp];
                }
            });

        if (item['categories'] && item['categories']['length'] && item.categories.length > 0) {
            p["gr:categories"] = item.categories.join(",");
        }

        return oi;
    }

    function dump(arr_items, genId) {
        return {
                "@context": {
                "pto": "http://productontology.org/id/",
                "s": "http://schema.org/",
                "gr": "http://purl.org/goodrelations/v1#",
                "xsd": "http://www.w3.org/2001/XMLSchema#",
                "rdfs": "http://www.w3.org/2000/01/rdf-schema#" },
                "@graph": [
                    {
                        "@id": "_:b"+genId(),
                      "@type": "s:Person",
                     "s:owns": _.map(arr_items, function(i){return toOwnershipRec(i, genId); }) }]
               };
    }

    return {
        toOwnershipRec : toOwnershipRec,
        dump : dump
    }
})();

