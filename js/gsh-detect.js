//if ($('link[rel="http://purl.org/xventory/sink"]').length > 1) {
//var $link = $('link[rel="http://purl.org/xventory/sink"]');
//if ($link.length > 0) {
//    chrome.extension.sendRequest({}, function(response) {});
//}

var drawer = {};

drawer.sendToStore = function(data, callback) {
    chrome.extension.sendMessage(data, callback);
}

var pageStore = rdfstore.create({persistent:false, name:'drawer_temp', overwrite:true}, function () { });

// currently in use
var allOffersFromStoreSparql = "PREFIX gr: <http://purl.org/goodrelations/v1#> \
                               PREFIX foaf: <http://xmlns.com/foaf/0.1/> \
                               SELECT ?name ?product_name ?imageUrl WHERE { ?offer a gr:Offering. \
                                                              ?offer gr:name ?name. \
                                                              OPTIONAL \
                                                              { ?offer gr:includesObject ?tqn.\
                                                                ?tqn gr:typeOfGood ?product.\
                                                                ?product gr:name ?product_name.\
                                                                ?product foaf:depiction ?imageUrl\
                                                              } }";

// alt. query
var allItemsFromStoreSparql = "PREFIX gr: <http://purl.org/goodrelations/v1#> \
                               PREFIX foaf: <http://xmlns.com/foaf/0.1/> \
                               SELECT ?name ?imageUrl WHERE { {?p a gr:ProductOrService. }\
                                                               UNION {?p a gr:ProductOrServiceModel. }\
                                                               UNION {?p a gr:SomeItems. } \
                                                              ?p gr:name ?name. \
                                                              OPTIONAL \
                                                              { ?p foaf:depiction ?imageUrl } }";

var addItemOpenDialogTpl = _.template("<div class='addItemOpenDialog'><a id='drawer_addItemOpenDialog' class='btn btn-info' data-toggle='modal' href='#drawer_addItemDialog'>++ Items ++</a></div>");

var addItemDialogTpl = _.template("" +
    "<div id='drawer_addItemDialog' class='modal hide'>" +
    "<div class='modal-header'>" +
        "<button type='button' class='close' data-dismiss='modal'>×</button><h3>You may add these items to your Inventory</h3></div>" +
    "<div class='modal-body'>" +
        "<ul class='thumbnails'>" +
        "<% _.each(items, function(item) { %>" +
            "<li class='span3'>" +
                "<div class='thumbnail'>" +
                    "<img src='<%= item.imageUrl %>' alt=''>" +
                        "<div class='caption'>" +
                            "<h5 style='text-align: center'><%= item.name %></h5>" +
                            "<p><a class='btn btn-primary addItemAction' href='#' data-name='<%= item.name %>' data-image-url='<%= item.imageUrl %>'>Add</a></p>" +
                        "</div></div></li><% }); %></ul></div></div>");

var shareItemsDialogTpl = _.template("<div id='drawer_shareItemDialog' class='modal hide'>" +
    "<div class='modal-header'>" +
    "<button type='button' class='close' data-dismiss='modal'>×</button><h3>laptopcase.biz is interested in items you own</h3></div>" +
    "<div class='modal-body'>" +
    "<h6><%= items %></h6>" +
    "<p>Do you want to share them?</p>" +
    "<p><a class='btn btn-primary shareItemAction' href='#' data-name='<%= item.name %>' data-image-url='<%= item.imageUrl %>'>Yes</a>&nbsp;&nbsp;&nbsp;&nbsp;" +
    "   <a class='btn btn-primary optOutAction' href='#' data-name='<%= item.name %>' data-image-url='<%= item.imageUrl %>'>No</a></p>" +
    "</div></div>");

    $(function() {
        setTimeout(
        function() {
        if (window.location.href != "http://localhost:5000/") {
            return;
        }
        var $link = $('link[rel="http://purl.org/xventory/sink"]');
        if ($link.length > 0) {

            gsh_sink_url = $link[0].href;

            var items = [];

            $("<link type='text/css' rel='stylesheet' href='"+
                chrome.extension.getURL("css/bootstrap.inpage.min.css")+"'>").appendTo("head");
            var ownershipInfo = shopping_history["@graph"][0]["s:owns"];
            for (var i=0;i<ownershipInfo.length;i++) {

                item = ownershipInfo[i]["@type"] == "s:OwnershipInfo" ? ownershipInfo[i]["s:typeOfGood"] : ownershipInfo[i];
                if (item["s:name"]) {
                    items.push(item["s:name"]);
                }
            }

            $(shareItemsDialogTpl({items:items.join(", ")})).appendTo("body");
            var $m = $("#drawer_shareItemDialog");
            $m.modal();
            $(".shareItemAction").on("click", _.once(function() {

                $.ajax({
                    type: "POST",
                    url: gsh_sink_url,
                    headers: { "Content-Type" : "application/json"},
                    data: JSON.stringify(shopping_history),
                    processData: false,
                    success : function (data, status, jqxhr) {
                        $m.modal("hide");
                        var loc = jqxhr.getResponseHeader("Content-Location");
                        var status_code = jqxhr.status;
                        if ( status_code == 201 && loc) {
                            // TODO security enhancements: do not allow cross-domain redirect
                            window.location.href = loc;
                        }
                    }});
            }));
            $(".optOutAction").on("click", function() {
                $m.modal('hide');
            })
        }}), 10000
    });

$(document).ready(function() {
    var page_content = $("html").html();
    if (/(gr:|goodrelations)/i.test(page_content)) {
        $.get("http://rdf-translator.appspot.com/convert/detect/n3/" + encodeURIComponent(window.location.href),
            //function(data) {
            function(data, success, jqxhr) {
                pageStore.load("text/n3", data, function(success, results) {
                    if (success) {
                        pageStore.execute(allOffersFromStoreSparql, function(success, results) {
                            if (success) {
                                if (!$.isArray(results)) { results = [results]; };
                                var items = _.map(results, function(result) {
                                    var item = {};
                                    item.name = result.product_name ? result.product_name.value : result.name.value;
                                    if (result.imageUrl) {
                                        item.imageUrl = result.imageUrl.value;
                                    }
                                    return item;
                                });
                                if (results.length > 0) {

                                    // add css
                                    $("<link type='text/css' rel='stylesheet' href='"+
                                        chrome.extension.getURL("css/bootstrap.inpage.min.css")+"'>").appendTo("head");

                                    $(addItemOpenDialogTpl()).appendTo("body");
                                    $(addItemDialogTpl({items:items})).appendTo("body");
                                    $("#drawer_addItemDialog").modal({show: false});
                                    $(".addItemAction").on("click", _.once(function() {
                                        var $this = $(this);
                                        var name = $this.data("name");
                                        var imageUrl = $this.data("image-url");
                                        drawer.sendToStore({name:name, imageUrl:imageUrl}, function(response)
                                        { response;
                                            $this.text("Added");
                                        });
                                        $this.addClass("disabled");
                                    }));
                                }

                            }
                        });
                    }
                });
        });
    }
});

// framed, compacted jsonld
var shopping_history = {
    "@context": {
        "pto": "http://productontology.org/id/",
        "s": "http://schema.org/",
        "gr": "http://purl.org/goodrelations/v1#",
        "rdfs": "http://www.w3.org/2000/01/rdf-schema#"
    },
    "@graph": [
        {
            "@id": "http://laszlotorok.info/me",
            "@type": "s:Person",
            "s:owns": [
                {
                    "s:ownedFrom": "2011-08-10T15:00:00",
                    "s:typeOfGood": {
                        "s:gtin13": "4710937385939",
                        "s:name": "HTC Desire X",
                        "s:brand": {
                            "s:name": "HTC",
                            "@id": "http://laszlotorok.info/htc",
                            "@type": "s:Brand"
                        },
                        "gr:category": "Electronics > Communications > Telephony > Mobile Phones > Smartphones",
                        "@id": "http://laszlotorok.info/htcdesire",
                        "@type": [
                            "gr:ProductOrService",
                            "s:Product",
                            "pto:Smartphone"
                        ]
                    },
                    "@id": "_:b2",
                    "@type": "s:OwnershipInfo",
                    "s:ownedThrough": "2012-03-15T15:00:00"
                },
                {
                    "s:ownedFrom": "2007-01-01T15:00:00",
                    "@id": "_:b1",
                    "@type": "s:OwnershipInfo",
                    "s:typeOfGood": {
                        "gr:category": "Vehicles & Parts",
                        "s:brand": {
                            "s:name": "Volkswagen",
                            "@id": "http://laszlotorok.info/vw",
                            "@type": "s:Brand"
                        },
                        "s:name": "VW Golf",
                        "@id": "http://laszlotorok.info/vwgolf",
                        "@type": [
                            "pto:Automobile",
                            "s:Product",
                            "gr:ProductOrService"
                        ]
                    }
                },
                {
                    "s:ownedFrom": "2011-03-01T15:00:00",
                    "@id": "_:b3",
                    "@type": "s:OwnershipInfo",
                    "s:typeOfGood": {
                        "s:gtin13": "4242003356364",
                        "s:name": "VS06G2410",
                        "s:brand": {
                            "s:name": "Siemens",
                            "@id": "http://laszlotorok.info/siemens",
                            "@type": "s:Brand"
                        },
                        "gr:category": "Home & Garden > Household Appliances > Vacuums",
                        "@id": "http://laszlotorok.info/vacuumcleaner",
                        "@type": [
                            "gr:ProductOrService",
                            "pto:Vacuum_cleaner",
                            "s:Product"
                        ]
                    }
                },
                {
                    "s:ownedFrom": "2011-03-01T15:00:00",
                    "@id": "_:b4",
                    "@type": "s:OwnershipInfo",
                    "s:typeOfGood": {
                        "s:gtin14": "00085854217958",
                        "s:name": "Laptop Messenger Bag",
                        "@id": "http://laszlotorok.info/lbag",
                        "@type": [
                            "s:Product",
                            "gr:ProductOrService"
                        ]
                    }
                },
                {
                    "s:ownedFrom": "2011-03-01T15:00:00",
                    "@id": "_:b0",
                    "@type": "s:OwnershipInfo",
                    "s:typeOfGood": {
                        "s:gtin13": "0885909296880",
                        "s:name": "Macbook Pro",
                        "s:brand": {
                            "s:name": "Apple",
                            "@id": "http://laszlotorok.info/apple",
                            "@type": "s:Brand"
                        },
                        "gr:category": "Electronics > Computers > Laptops",
                        "@id": "http://laszlotorok.info/macbookpro",
                        "@type": [
                            "s:Product",
                            "pto:Laptop",
                            "pto:Macbook",
                            "gr:ProductOrService"
                        ]
                    }
                }
            ]
        }
    ]
};

