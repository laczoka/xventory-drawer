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
