// CONSTANTS
var AMAZON_PURCHASE_HISTORY_URL = "https://www.amazon.de/gp/css/order-history/ref=oss_pagination_1_2?ie=UTF8";

var PLACEHOLDER_IMG_100x79_URL = "http://placehold.it/100x79";


// GLOBAL VARS ( I know, it's evil, but hey this is a prototype... )
var $action_button = $('#import_amazon_items');
var AmazonTab = null;

function visit_amazon_purchase_history() {
    chrome.tabs.create({'url': AMAZON_PURCHASE_HISTORY_URL}, function(tab) {
        AmazonTab = tab;
    });
}

function ImportStateMachine(drawer, vm) {
    var self = this;

    self.vm = vm;
    self.drawer = drawer;

    self.years_extracted = false;
    self.years_to_extract = [];
    self.current_year = undefined;
    self.current_page_offset = 0;

    self.fetch_next_page = function () {
        var url = AMAZON_PURCHASE_HISTORY_URL + "&orderFilter="+self.current_year + "&startIndex=" + self.current_page_offset;
        console.log("Fetching "+url);
        $.get(url)
            .done(self.on_page_received)
            .fail(function() { alert("Error occured during the import! Operation aborted.");});
    };

    self.getYears = function($page) {
        var years = $("#orderFilter option", $page)
            .filter(function() {
                return /year-[0-9]{4}/i.test($(this).val());
            })
            .map(function (idx,e) {
                return $(e).val();
            })
            .toArray();
        return years;
    };


    self.on_page_received = function (page_data) {

        if (!self.years_extracted) {
            self.years_to_extract = self.getYears($(page_data));
            self.current_year = self.years_to_extract.pop();
            self.years_extracted = true;
            self.fetch_next_page();
            return;
        }

        var productsFound = self.amazon_scrape_content($(page_data));

        console.log(productsFound);

        if (productsFound.length > 0) {

            var itemsAdded = self.drawer.addItems(productsFound);
            self.drawer.save();

            var newItemCount = _.filter(itemsAdded, function(i) { return i == true;}).length;

            self.vm.importCount(self.vm.importCount() + newItemCount);

            self.current_page_offset += 10;

            self.fetch_next_page();

        } else if (self.years_to_extract.length > 0) {
            self.current_year = self.years_to_extract.pop();
            self.current_page_offset = 0;

            self.fetch_next_page();

        } else {
            self.vm.importState(self.vm.IMPORT_DONE);
        }
    };

    self.amazon_scrape_content = function($content) {

        var product_batches = $(".action-box",$content).map(function(idx,e) {

            var links = $("a",e).map(function(idx,e) {
                return { acquiredFrom: "http://www.amazon.com/", name: $(e).text().trim(), url: $(e).attr("href") };
            });

            var productLinkPatt = /product\/([A-Z0-9]+)\//;

            var product_batch = _.filter(links, function (p) {
                productLinkPatt.lastIndex = 0;
                return p.url && productLinkPatt.test(p.url);
            });

            var date_candidates = $("h2",e).map(function(i,h2) {
                var date_candidate = $(h2).text();
                date_candidate = translate_month(date_candidate);
                return Date.parse(date_candidate);
            });

            var date_of_purchase = _.find(date_candidates, function (dc){return !isNaN(dc);});

            // post process name
            product_batch = _.map(product_batch, function(p) {
                var name = p["name"];
                // remove "[number] of ...." from the product name
                p["name"] = name.replace(/^[0-9]+\s(of|von)\s+/,"");
                return p;
            });

            if (date_of_purchase) {
                product_batch = _.map(product_batch, function (p) { p["ownedFrom"] = new Date(date_of_purchase); return p;});
            } else {
                product_batch = _.map(product_batch, function (p) { p["ownedFrom"] = ""; return p;});
            }

            // add asin
            product_batch = _.map(product_batch, function(p) {
                var m;
                if (p.url && (m = productLinkPatt.exec(p.url)) && m.length == 2) {
                    p["asin"] = m[1];
                } else {
                    p["asin"] = "";
                }
                return p;
            });
            // add image
            product_batch = _.map(product_batch, function(p) {
                var $img = $("a[href='"+ p.url +"'] img", e).first();
                var imgUrl = $img.attr("src");
                if (imgUrl) {
                    p["image"] = imgUrl;
                    p["name"] = $img.attr("title") || $img.attr("alt") || p["name"];
                } else {
                    p["image"] = PLACEHOLDER_IMG_100x79_URL;
                }
                return p;
            })

            return product_batch;
        });
        return _.flatten(product_batches);
    }
}

function start_importing_purchase_history(vm) {
    var import_sm = new ImportStateMachine(drawer, vm);
    vm.importState(vm.IMPORT_IN_PROGRESS);
    $.get(AMAZON_PURCHASE_HISTORY_URL)
        .done(import_sm.on_page_received)
        .fail(function() {console.log("Error retrieving page"); });
}

function translate_month(datestr) {
    return datestr
        .replace(/Januar/i, "January")
        .replace(/Februar/i, "February")
        .replace("\u00e4rz", "arch")
        .replace(/Mai/i, "May")
        .replace(/Juni/i, "June")
        .replace(/Juli/i, "July")
        .replace(/Oktober/i, "October")
        .replace(/Dezember/i, "October");
}


// KnockoutJS View Model
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
// INIT
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
