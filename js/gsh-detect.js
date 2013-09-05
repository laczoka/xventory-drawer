//if ($('link[rel="http://purl.org/xventory/sink"]').length > 1) {
//var $link = $('link[rel="http://purl.org/xventory/sink"]');
//if ($link.length > 0) {
//    chrome.extension.sendRequest({}, function(response) {});
//}

var drawer = {};

drawer.sendToStore = function(data, callback) {
    chrome.extension.sendMessage(data, callback);
}

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

var itemListTpl = _.template(
    "<% _.each(ois, function(oi) { %>" +
    "<tr>" +
    "<% if (oi['s:ownedThrough']) { %>" +
        "<td style='color:grey'><span><%= oi['s:typeOfGood']['s:name'] %></span><br><small>(owned until <%= oi['s:ownedThrough']['@value'] %>)</small></td>" +
    "<% } else { %>" +
        "<td><%= oi['s:typeOfGood']['s:name'] %></td>" +
    "<% } %>" +
    "<td><input class='share' type='checkbox' value='<%= oi['s:typeOfGood'][\"@id\"] %>' checked></td>" +
    "</tr>" +
    "<% }); %>");

var shareItemsDialogTpl = _.template("<div id='drawer_shareItemDialog' class='modal hide'>" +
    "<div class='modal-header'>" +
    "<button type='button' class='close' data-dismiss='modal'>×</button><h3>Acme Shop, Inc. (http://acmeshop.com/) is interested in items you own</h3></div>" +
    "<div class='modal-body'>" +
    "<h5>Do you want to share the following list with Acme Shop, Inc.?</h5>" +
    "<table class='table'><thead><tr><th>Item</th><th><small>Share?</small></th></tr></thead>" +
    "<tbody>" +
    "<%= itemtable %>" +
    "</tbody>" +
    "</table>" +
    "<p><a class='btn btn-primary shareItemAction' href='#'>Yes</a>&nbsp;&nbsp;&nbsp;&nbsp;" +
    "   <a class='btn btn-primary optOutAction' href='#'>No</a></p>" +
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

            $("<link type='text/css' rel='stylesheet' href='"+
                chrome.extension.getURL("bootstrap.inpage/css/bootstrap.min.css")+"'>").appendTo("head");
            var ownershipInfo = shopping_history["@graph"][0]["s:owns"];

            $(shareItemsDialogTpl({ itemtable: itemListTpl({ois:ownershipInfo})})).appendTo("body");
            var $m = $("#drawer_shareItemDialog");
            $m.modal();
            $(".shareItemAction").on("click", _.once(function() {

                var sh_to_send = JSON.parse(JSON.stringify(shopping_history));

                var share_ids = []
                $("input.share:checked").each(function(idx,e) {
                    share_ids.push($(e).val());
                });

                sh_to_send["@graph"][0]["s:owns"]= _.filter(sh_to_send["@graph"][0]["s:owns"], function(oi) {
                    return oi["s:typeOfGood"] && (share_ids.indexOf(oi["s:typeOfGood"]["@id"]) >= 0);
                });

                $.ajax({
                    type: "POST",
                    url: gsh_sink_url,
                    headers: { "Content-Type" : "application/ld+json"},
                    data: JSON.stringify(sh_to_send),
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
                                        chrome.extension.getURL("bootstrap.inpage/css/bootstrap.min.css")+"'>").appendTo("head");

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
        "xsd": "http://www.w3.org/2001/XMLSchema#",
        "rdfs": "http://www.w3.org/2000/01/rdf-schema#"
    },
    "@graph": [
        {
            "@id": "http://laszlotorok.info/me",
            "@type": "s:Person",
            "s:owns": [
                {
                    "s:ownedFrom": {
                        "@type": "xsd:dateTime",
                        "@value": "2011-03-01T15:00:00"
                    },
                    "@id": "_:b5",
                    "@type": "s:OwnershipInfo",
                    "s:typeOfGood": {
                        "s:gtin14": "00085854217958",
                        "s:name": "Laptop Messenger Bag",
                        "@id": "http://laszlotorok.info/lbag",
                        "@type": [
                            "gr:ProductOrService",
                            "s:Product"
                        ]
                    }
                },
                {
                    "s:ownedFrom": {
                        "@type": "xsd:dateTime",
                        "@value": "2011-08-10T15:00:00"
                    },
                    "s:typeOfGood": {
                        "s:gtin13": "4710937385939",
                        "s:name": "GTC Cheshire X",
                        "s:brand": {
                            "s:name": "GTC",
                            "@id": "http://laszlotorok.info/gtc",
                            "@type": "s:Brand"
                        },
                        "gr:category": "Electronics > Communications > Telephony > Mobile Phones > Smartphones",
                        "@id": "http://laszlotorok.info/gtccheshire",
                        "@type": [
                            "gr:ProductOrService",
                            "pto:Smartphone",
                            "s:Product"
                        ]
                    },
                    "@id": "_:b2",
                    "@type": "s:OwnershipInfo",
                    "s:ownedThrough": {
                        "@type": "xsd:dateTime",
                        "@value": "2012-03-15T15:00:00"
                    }
                },
                {
                    "s:ownedFrom": {
                        "@type": "xsd:dateTime",
                        "@value": "2007-01-01T15:00:00"
                    },
                    "@id": "_:b1",
                    "@type": "s:OwnershipInfo",
                    "s:typeOfGood": {
                        "gr:category": "Vehicles & Parts",
                        "s:brand": {
                            "s:name": "Peopleswagen",
                            "@id": "http://laszlotorok.info/pw",
                            "@type": "s:Brand"
                        },
                        "s:name": "PW Gulf",
                        "@id": "http://laszlotorok.info/pwgulf",
                        "@type": [
                            "gr:ProductOrService",
                            "pto:Automobile",
                            "s:Product"
                        ]
                    }
                },
                {
                    "s:ownedFrom": {
                        "@type": "xsd:dateTime",
                        "@value": "2012-03-10T08:00:00"
                    },
                    "@id": "_:b3",
                    "@type": "s:OwnershipInfo",
                    "s:typeOfGood": {
                        "s:gtin13": "4000000000000",
                        "s:name": "uPhone 5",
                        "s:brand": {
                            "s:name": "Upple",
                            "@id": "http://laszlotorok.info/upple",
                            "@type": "s:Brand"
                        },
                        "gr:category": "Electronics > Communications > Telephony > Mobile Phones > Smartphones",
                        "@id": "http://laszlotorok.info/uphone5",
                        "@type": [
                            "pto:Smartphone",
                            "s:ProductModel",
                            "s:Product"
                        ]
                    }
                },
                {
                    "s:ownedFrom": {
                        "@type": "xsd:dateTime",
                        "@value": "2011-03-01T15:00:00"
                    },
                    "@id": "_:b0",
                    "@type": "s:OwnershipInfo",
                    "s:typeOfGood": {
                        "s:gtin13": "0885909296880",
                        "s:name": "Micbook",
                        "s:brand": {
                            "@id": "http://laszlotorok.info/upple"
                        },
                        "gr:category": "Electronics > Computers > Laptops",
                        "@id": "http://laszlotorok.info/micbook",
                        "@type": [
                            "pto:Laptop",
                            "pto:Macbook",
                            "gr:ProductOrService",
                            "s:Product"
                        ]
                    }
                },
                {
                    "s:ownedFrom": {
                        "@type": "xsd:dateTime",
                        "@value": "2011-03-01T15:00:00"
                    },
                    "@id": "_:b4",
                    "@type": "s:OwnershipInfo",
                    "s:typeOfGood": {
                        "s:gtin13": "4242003356364",
                        "s:name": "Vacuum Cleaner VS06G2410",
                        "s:brand": {
                            "s:name": "Ziemens",
                            "@id": "http://laszlotorok.info/ziemens",
                            "@type": "s:Brand"
                        },
                        "gr:category": "Home & Garden > Household Appliances > Vacuums",
                        "@id": "http://laszlotorok.info/vacuumcleaner",
                        "@type": [
                            "pto:Vacuum_cleaner",
                            "gr:ProductOrService",
                            "s:Product"
                        ]
                    }
                }
            ]
        }
    ]
};

