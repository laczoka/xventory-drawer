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

function AmazonHistoryImporter(drawer, vm) {
    var self = this;

    self.drawer = drawer;
    self.vm = vm;

    // fetch_page :: url -> D(response)
    function fetch_page(url) {
        //return $.get(url);
        return $.ajax({
            url: url,
            beforeSend: function(jqxhr, settings) { jqxhr.requestURL = url; }})
            .then(function(data,status,jqXHR) { return { data:data, url: jqXHR.requestURL }});
    }
    // parse_item_page :: response -> {order}
    function parse_item_page(response) {
        var $content = $(response.data);
        var host = /^(http(s)?:\/\/[\.\-a-z]+)\//i.exec(response.url)[1];

        var product_orders = $(".action-box",$content).map(function(idx,e) {

            var order_link_patt = /summary\/edit.*&orderID=([-0-9a-zA-Z]+)/i;

            var order_url = $("a",e)
                .filter(function(idx,a) { return order_link_patt.test($(a).attr("href")) })
                .first().attr("href");

            order_link_patt.lastIndex = 0;
            var orderId = order_url && order_link_patt.exec(order_url)[1];
            var order_url = order_url && (order_url[0] == "/") ? host+order_url : order_url;

            var links = $("a",e).map(function(idx,e) {
                return { url: $(e).attr("href"), name: $(e).text().trim()  };
            });

            var productLinkPatt = /product\/([A-Z0-9]+)\//;

            var product_batch = _.filter(links, function (p) {
                productLinkPatt.lastIndex = 0;
                return p.url && productLinkPatt.test(p.url);
            });
            // get count + post process name
            product_batch = _.map(product_batch, function(p) {
                var name = p["name"];
                var count_re = /^([0-9])+\s(of|von)/.exec();
                p["count"] = count_re ? count_re[1] : 1;
                // remove "[number] of ...." from the product name
                p["name"] = name.replace(/^[0-9]+\s(of|von)\s+/,"");
                return p;
            });

            var date_candidates = $("h2",e).map(function(i,h2) {
                var date_candidate = $(h2).text();
                date_candidate = translate_month(date_candidate);
                return Date.parse(date_candidate);
            });

            var date_of_purchase = _.find(date_candidates, function (dc){return !isNaN(dc);});

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
                } else {
                    p["image"] = PLACEHOLDER_IMG_100x79_URL;
                }
                return p;
            });
            return { orderId : orderId, url : order_url, items: product_batch };
        });
        return product_orders;
    }

    // parse_order_page :: response -> {item}
    function parse_order_page(response) {
        $page_data = $(response.data);
        var orderId_re = /summary\/edit.*&orderID=([-0-9a-zA-Z]+)/i.exec(response.url);
        var orderId = orderId_re ? orderId_re[1] : undefined;
        var arr_items_pricestr = $("a", $page_data)
            .filter(function(i) {
                return /product\/[0-9A-Z]+/.test($(this).attr("href")); })
            .map(function (idx, e) {
                var url = $(e).attr("href");
                var raw_name = $(e).text().trim();
                var asin = url.match(/product\/([0-9A-Z]+)/)[1];
                return {
                    asin : asin,
                    acquiredFrom: "http://www.amazon.com/",
                    url : url,
                    name : raw_name,
                    price : $(e).parents("td").first().next("td").text().trim()
                }; });

        var arr_items = _.map(arr_items_pricestr, function(item_pricestr) {
            var pricestr = item_pricestr.price;
            var currency_res = pricestr.match(/(EUR|\u20ac)/i);
            var currency = _.isArray(currency_res) ? currency_res[0] : undefined;
            var amount_res = pricestr.replace(",",".").match(/[0-9]+(\.[0-9]{1,2})?/);
            var amount = _.isArray(amount_res) ? parseFloat(amount_res[0]) : undefined;
            return currency && amount ? _.extend(item_pricestr, {price : { amount: amount, currency: currency } }) : undefined;
        });

        return { orderId: orderId, items: _.compact(arr_items) };
    }

    function merge_orders(o1,o2) {
        if (o1.orderId == o2.orderId) {
            var items1_by_asin = _.indexBy(o1.items.slice(0),"asin"),
                items2 = o2.items.slice(0);

            items1 = _.values(_.reduce(items2, function(items_by_asin, item) {
                var asin = item["asin"];
                if (asin && items_by_asin[asin]) {
                    items_by_asin[asin] = _.extend(items_by_asin[asin],item);
                }
                return items_by_asin;
            }, items1_by_asin));
            o1.items = items1;
            return o1;
        } else {
            return undefined;
        }
    }

    function is_empty(coll) {
        return coll && (_.size(coll) == 0);
    }

    // get_items :: url -> D({item})
    function get_items (url,start_index) {
        var start_index = start_index || 0;
        var url_to_fetch = url + "&startIndex="+start_index;
        var D_page = fetch_page(url_to_fetch);
        var D_arr_product_orders = (async.lift1(parse_item_page))(D_page);
        var D_arr_order_page_urls = async.map(D_arr_product_orders, function(o) { return o.url });
        var D_arr_D_order_pages = async.map(D_arr_order_page_urls,fetch_page);
        var D_arr_D_product_orders2 = async.map(D_arr_D_order_pages, async.lift1(parse_order_page));
        var D_arr_product_orders2 = async.collect(D_arr_D_product_orders2);
        var D_arr_ext_product_orders = async.map2(D_arr_product_orders, D_arr_product_orders2, merge_orders);

        return async.decider(is_empty,
            // then
            function(D_arr_ext_product_orders) {
                return D_arr_ext_product_orders;
            },
            // else
            function (D_arr_ext_product_orders) {
                return (async.lift2(_.bind(Array.prototype.concat,[])))(D_arr_ext_product_orders, get_items(url, start_index+10));
            })(D_arr_ext_product_orders);
    }

    function item_page_url_by_year(yearopt) {
        return AMAZON_PURCHASE_HISTORY_URL+"&orderFilter="+yearopt;
    }

    // get_years :: page -> {year-option}
    function get_years(response) {
        var $page = $(response.data);
        var years = $("#orderFilter option", $page)
            .filter(function() {
                return /year-[0-9]{4}/i.test($(this).val());
            })
            .map(function (idx,e) {
                return $(e).val();
            })
            .toArray();
        //return years;
        // TODO DEBUG remove following line
        return ["year-2013"];
    }

    self.start = function() {

        self.vm.importState(vm.IMPORT_IN_PROGRESS);

        var D_first_page = fetch_page(AMAZON_PURCHASE_HISTORY_URL);
        var D_arr_year_opts = (async.lift1(get_years))(D_first_page);
        var D_arr_item_page_seed_urls = async.map(D_arr_year_opts, item_page_url_by_year);
        var D_arr_D_arr_items = async.map(D_arr_item_page_seed_urls, get_items);
        var D_arr_items = async.reduce(D_arr_D_arr_items, async.lift2(_.bind(Array.prototype.concat,[])),[]);

        D_arr_items.then(function(arr_items) // cheat again :)
        {   // maybe move this to a separate function representing the final step in the flow of computation
            var itemsAdded = self.drawer.addItems(_.values(arr_items));
            var newItemCount = _.filter(itemsAdded,function(b) {return b}).length;
            self.drawer.save();
            self.vm.importTabImportCount(newItemCount);
            self.vm.importState(self.vm.IMPORT_DONE);
        });
    };
}



function start_importing_purchase_history(vm) {
    //var import_sm = new ImportStateMachine(drawer, vm);
    //import_sm.start();

    var importer = new AmazonHistoryImporter(drawer,vm);
    importer.start();
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
