//if ($('link[rel="http://purl.org/xventory/sink"]').length > 1) {
var $link = $('link[rel="http://purl.org/xventory/sink"]');
if ($link.length > 0) {
    chrome.extension.sendRequest({}, function(response) {});
}

var pageStore = rdfstore.create({persistent:false, name:'drawer_temp', overwrite:true}, function () { });

var allItemsFromStoreSparql = "PREFIX gr: <http://purl.org/goodrelations/v1#> \
                               PREFIX foaf: <http://xmlns.com/foaf/0.1/> \
                               SELECT ?name ?imageUrl WHERE { {?p a gr:ProductOrService. }\
                                                               UNION {?p a gr:ProductOrServiceModel. }\
                                                               UNION {?p a gr:SomeItems. } \
                                                              ?p gr:name ?name. \
                                                              OPTIONAL \
                                                              { ?p foaf:depiction ?imageUrl } }";

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

var addItemAction = _.template("<div class='addItemAction'><a id='drawer_addItemAction' class='btn btn-info' data-toggle='modal' href='#drawer_addItemDialog'>++ Items ++</a></div>");

var addItemDialog = _.template("" +
    "<div id='drawer_addItemDialog' class='modal hide'>" +
    "<div class='modal-header'>" +
        "<button type='button' class='close' data-dismiss='modal'>×</button><h3>You may add these items to your Inventory</h3></div>" +
    "<div class='modal-body'>" +
        "<ul class='thumbnails'>" +
        "<% _.each(items, function(item) { %>" +
            "<li class='span3'>" +
                "<div class='thumbnail'>" +
                    "<img src='<%= item.imageUrl %>' alt=''>" +
                        "<h5 style='text-align: center'><%= item.name %></h5></div></li><% }); %></ul></div></div>");


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

                                    $(addItemAction()).appendTo("body");
                                    $(addItemDialog({items:items})).appendTo("body");
                                    $("#drawer_addItemDialog").modal({show: false});
                                }

                            }
                        });
                    }
                });
        });
    }
});
