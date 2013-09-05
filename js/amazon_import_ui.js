
var AMAZON_PURCHASE_HISTORY_URL = "https://www.amazon.de/gp/css/order-history/?ie=UTF8";

var $action_button = $('#import_amazon_items');

var AmazonTab = null;

function amazon_scrape_content(jqCtx) {

    var product_batches = $(".action-box",jqCtx).map(function(idx,e) {

        var links = $("a",e).map(function(idx,e) {
            return { acquiredFrom: "http://www.amazon.com/", name: $(e).text().trim(), url: $(e).attr("href") };
        });

        var productLinkPatt = /product\/([A-Z0-9]+)\//;

        var product_batch = _.filter(links, function (p) {
            productLinkPatt.lastIndex = 0;
            return p.url && productLinkPatt.test(p.url);
        });


        var date_candidates = $("h2",e).map(function(i,e) { return Date.parse(translate_month($(e).text())); });
        var date_of_purchase = _.find(date_candidates, function (dc){return !isNaN(dc);});

        if (date_of_purchase) {
            product_batch = _.map(product_batch, function (p) { p["ownedFrom"] = new Date(date_of_purchase); return p;});
        }

        // add asin
        product_batch = _.map(product_batch, function(p) {
            var m;
            if (p.url && (m = productLinkPatt.exec(p.url)) && m.length == 2) {
                p["asin"] = m[1];
            }
            return p;
        });
        // add image
        product_batch = _.map(product_batch, function(p) {
            var imgUrl = $("img[alt='"+ p.name +"']", e).first().attr("src");
            if (imgUrl) {
                p["image"] = imgUrl;
            }
            return p;
        })

        return product_batch;
    });
    return _.flatten(product_batches);
}

function visit_amazon_purchase_history() {
    chrome.tabs.create({'url': AMAZON_PURCHASE_HISTORY_URL}, function(tab) {
        AmazonTab = tab;
    });
}

function start_importing_purchase_history(vm) {
    vm.importState(vm.IMPORT_IN_PROGRESS);
    $.get(AMAZON_PURCHASE_HISTORY_URL)
        .done(function(data) {
            var productsFound = amazon_scrape_content($(data));
            vm.importCount(productsFound.length);
            vm.importState(vm.IMPORT_DONE);
            drawer.addItems(productsFound);
            drawer.save();
        })
        .fail(function() {console.log("Error retrieving page"); });
}

function translate_month(datestr) {
    return datestr
        .replace(/Januar/i, "January")
        .replace(/Februar/i, "February")
        .replace(/März/i, "March")
        .replace(/Mai/i, "May")
        .replace(/Juni/i, "June")
        .replace(/Juli/i, "July")
        .replace(/Oktober/i, "October")
        .replace(/Dezember/i, "October");


}

// IDLE,

function importTabVM() {
    var self = this;
    self.IDLE = "IDLE";
    self.WAIT_LOGIN = "WAIT_LOGIN";
    self.RDY_TO_IMPORT = "RDY_TO_IMPORT";
    self.IMPORT_IN_PROGRESS = "IMPORT_IN_PROGRESS";
    self.IMPORT_DONE = "IMPORT_DONE";

    this.importState = ko.observable("IDLE");
    this.importCount = ko.observable(0);

    this.importTabActionBtnLabel = ko.computed(function() {
        var lab = {
            "WAIT_LOGIN" : "Waiting for you to login...",
            "RDY_TO_IMPORT" : "Start importing purchase history",
            "IMPORT_IN_PROGRESS" : "Please wait, import in progress..."
        }
        return lab[self.importState()] || "Go to Amazon Order History";
    });

    this.importTabActionBtnDisabled = ko.computed(function() {
        var s = self.importState();
        return s == self.WAIT_LOGIN || s == self.IMPORT_IN_PROGRESS;
    } );

    this.importTabImportCount = ko.computed(function() {
       return self.importCount();
    });
}

$(function() {

    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        var vm = new importTabVM();
        if (/\/ap\/signin/.test(tabs[0].url)) {
            vm.importState(vm.WAIT_LOGIN);
        } else if (/order-history/.test(tabs[0].url) === true) {
            vm.importState(vm.RDY_TO_IMPORT);
            $action_button.click(function() {
                start_importing_purchase_history(vm); });
        } else {
            vm.importState(vm.IDLE);
            $action_button.click(visit_amazon_purchase_history);
        }
        ko.applyBindings(vm, document.getElementById("importTab"));
    });

});
