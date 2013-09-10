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

var async = {};
// asyncfunc :- aggr -> x -> Defered(aggr)
async.reduce = function (coll, asyncfunc, aggrv) {
    return (_.isArray(coll) && coll.length > 0) ?
        _.reduce(coll.slice(1),function(comp, x) {
            return comp.then(function(aggrv) { return asyncfunc(aggrv, x) });
        }, asyncfunc(aggrv, coll[0]))
        : []
};

function ImportStateMachine(drawer, vm) {
    var self = this;

    self.vm = vm;
    self.drawer = drawer;

    self.get_years = function(page_data) {
        var $page = $(page_data);
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

    self.scan_page_for_items = function(page_data) {
        var $content = $(page_data);
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
    };

    self.get_items_from_page = function(items_by_asin_already_found, url, start_index) {
        start_index = start_index || 0;
        var retrieve_url = url+"&startIndex="+start_index;
        return $.get(retrieve_url)
            .then(function(page_data) {
                var new_items = self.scan_page_for_items(page_data);
                var new_items_by_asin = _.indexBy(new_items, "asin");

                // DIRTY shortcut
                self.vm.scannedItemCount(self.vm.scannedItemCount()+new_items.length);

                return new_items.length > 0 ?
                    self.get_items_from_page(
                        _.extend(items_by_asin_already_found, new_items_by_asin), url, start_index+10) // RECURSE
                        : items_by_asin_already_found; },                           // BASE CASE
                  function () {
                    console.log("Error retrieving: "+retrieve_url);
                    return {};});
    };


    self.get_items = function(years_arr) {
        var item_page_urls = _.map(years_arr, function(year_opt) {
            return AMAZON_PURCHASE_HISTORY_URL + "&orderFilter="+year_opt;});

        var getting_items = async.reduce(item_page_urls, self.get_items_from_page, {});

        return getting_items.then(function(items_by_asin) { return _.values(items_by_asin)});
    }

    /*
    // TODO REMOVE
    self.fetch_next_order_page = function(order_page_url) {

        var url = order_page_url || self.order_pages_to_fetch.pop();
        if (!url) return;

        if (self.fetching_order_page && self.fetching_order_page.status() == "pending") {
         // enqueue
            self.order_pages_to_fetch.push(order_page_url);
        } else {
         // fetch next
            self.fetching_order_page = $.get(order_page_url)
                .done(
                // move this to extract_price
                function(data) {
                    var prices = self.scan_prices($(data));
                    _.each(prices, function)
                    // take next from the queue if available
                    self.fetch_next_order_page();
                })
                .fail(function () {
                    console.log("Error retrieving order page");
                });
        }
    };
    // TODO remove
    self.fetch_next_page = function () {
        var url = AMAZON_PURCHASE_HISTORY_URL + "&orderFilter="+self.current_year + "&startIndex=" + self.current_page_offset;
        console.log("Fetching "+url);
        $.get(url)
            .done(self.extract_items)
            .fail(function() { alert("Error occured during the import! Operation aborted.");});
    };

    // TODO remove
    self.extract_items = function (page_data) {
        var productsFound = self.amazon_scrape_content($(page_data));

        console.log(productsFound);

        if (productsFound.length > 0) {

            var itemsAdded = self.drawer.addItems(productsFound);
            self.drawer.save();

            var newItemCount = _.filter(itemsAdded, function(i) { return i == true;}).length;

            self.vm.scannedItemCount(self.vm.scannedItemCount() + newItemCount);

            self.current_page_offset += 10;

            self.fetch_next_page();

        } else if (self.years_to_extract.length > 0) {
            self.current_year = self.years_to_extract.pop();
            self.current_page_offset = 0;

            self.fetch_next_page();

        } else {
        }
    }; */


   /*     self.scan_prices = function($page_data) {

        var item_pricestr_arr = $("a", $page_data)
            .filter(function(i) {
                return /product\/[0-9A-Z]+/.test($(this).attr("href")); })
            .map(function (idx, e) {
                var asin = $(e).attr("href").match(/product\/([0-9A-Z]+)/)[1];
                return {
                    asin : asin,
                    price : $(e).parents("td").first().next("td").text().trim()
                }; });

        var price_currency = _.map(item_pricestr_arr, function(item_pricestr) {
            var pricestr = item_pricestr.price;
            var currency_res = pricestr.match(/(EUR|\u20ac)/i);
            var currency = _.isArray(currency_res) ? currency_res[0] : undefined;
            var amount_res = pricestr.replace(",",".").match(/[0-9]+(\.[0-9]{1,2})?/);
            var amount = _.isArray(amount_res) ? parseFloat(amount_res[0]) : undefined;
            return currency && amount ? _.extend(item_pricestr, {price : { amount: amount, currency: currency } }) : undefined;
        });

        return _.without(price_currency, undefined);
    }; */

    self.start = function() {
        self.vm.importState(vm.IMPORT_IN_PROGRESS);
        return $.get(AMAZON_PURCHASE_HISTORY_URL)
                .then(self.get_years, function(){console.log("Error retrieving page"); }) // TODO
                .then(self.get_items, function(){console.log("Error extracting years page"); }) // TODO
                .then(function(items) {
                // maybe move this to a separate function representing the final step in the flow of computation
                    var itemsAdded = self.drawer.addItems(_.values(items));
                    var newItemCount = _.filter(itemsAdded,function(b) {return b}).length;
                    self.drawer.save();
                    self.vm.importTabImportCount(newItemCount);
                    self.vm.importState(self.vm.IMPORT_DONE);});
    };
}

function start_importing_purchase_history(vm) {
    var import_sm = new ImportStateMachine(drawer, vm);
    import_sm.start();
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
    this.scannedItemCount = ko.observable(0);

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

    this.importTabImportCount = ko.observable(0);
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
