function DrawerItem (initVals) {
    var data = _.extend({
        name: undefined,
        url: undefined,
        count: 1,
        price : { amount: undefined, currency: undefined}
    }, initVals ? initVals : {});
    _.extend(this, data);
}


function Drawer($) {
    var self = this;
    self.$body = $("body");
    self._db = window.localStorage;
    // self._items :: { _id -> DrawerItem }
    self._items = undefined;

    self.genId = function() {
        var newid;
        do {
            newid = Math.floor(Math.random() * Math.pow(2,50))
        } while (self._items[newid]);
        return newid;
    };

    self.getItems = function() {
        return _(self._items).values();
    };

    self.reload = function() {
        self._items = self._db["Pinventory"] ? JSON.parse(self._db["Pinventory"]) : {};
        // migration script array -> indexed
        self._items = _.isArray(self._items) ?
            _.chain(self._items)
             .map(function(i) {return i["_id"] ? i : _(i).extend({_id:self.genId()});})
             .indexBy("_id")
             .value()
            : self._items;
        self.$body.trigger("drawer.itemsLoaded");
    };

    self.reload();

    self.save = function() {
        self._db["Pinventory"] = JSON.stringify(self._items);
    };

    self.lookupItem = function(_id) {
        return self._items[_id];
    };

    // upsert item
    self.saveItem = function (item) {
        var itemToSave = item["_id"] ? item : _(item).extend({_id:self.genId()}),
            itemInDb = self.lookupItem(item._id);
        self._items[item._id] = itemToSave;
        self.$body.trigger( itemInDb ? "drawer.itemChanged" : "drawer.itemAdded", _(itemToSave).clone());
        return _.clone(itemToSave);
    };

    // add if not yet in db based on ASIN, GTINx
    self.addItem = function(newItem) {
        var pIDkey = _.intersection(['gtin8', 'gtin13', 'gtin14', 'asin'], _.keys(newItem)).pop();
        var pID = pIDkey && newItem[pIDkey];
        var product_found_in_inventory = pID && _.find(
            _(self._items).values(), function(i) {
                return i[pIDkey] && (i[pIDkey] == pID)
                    && i["ownedFrom"] && (i["ownedFrom"] == newItem["ownedFrom"]);});

        if (!product_found_in_inventory) {
            var savedItem = self.saveItem(newItem);
            self.$body.trigger("drawer.itemAdded", newItem);
        }
        return product_found_in_inventory ? product_found_in_inventory : savedItem;
    };

    self.addItems = function(newItemsArr) {
        return _.map(newItemsArr,self.addItem);
    };

    self.deleteItem = function(itemId) {
        var itemToDelete = self.lookupItem(itemId);
        if (itemToDelete) {
            delete self._items[itemId];
            self.$body.trigger("drawer.itemDeleted", itemToDelete);
        }
    };

    self.deleteAll = function() {
        self._db["Pinventory"] = JSON.stringify([]);
        self.reload();
    };
}

drawer = new Drawer($);

function PinventoryViewModel(drawer, notifier) {
    var self = this,
        $body = $("body");
    self.pitems = ko.observableArray(drawer.getItems());
    self.notifier = notifier;

    // UI
    self.noPItemsYet = ko.computed(function () {
        return self.pitems().length < 1;
    });

    self.sortItemsMostRecentFirst = function() {
        self.pitems.sort(function(left,right) {
           var ld = left.ownedFrom ? left.ownedFrom : 0,
               rd = right.ownedFrom ? right.ownedFrom : 0;
           return ld == rd ? 0 : (ld < rd ? 1 : -1);
        });
    };

    self.formatDate = function(dt) {
        var d = new Date(dt);
        return d ? d.toDateString() : "N/A";
    };

    self.matchById = function(item1, item2) {
        return (item1["_id"] && item1._id === item2._id);}

    $body.on("drawer.itemAdded", function(event, newItem) {
        self.pitems.push(newItem);
        self.notifier.showNotification("success", "Just added a "+newItem.name+" to your inventory.")
    });
    $body.on("drawer.itemsLoaded", function() {
        self.pitems(drawer.getItems());
    });
    $body.on("drawer.itemChanged", function(event, savedItem) {
        var oldItem = ko.utils.arrayFirst(self.pitems(), _.partial(self.matchById, savedItem));
        if (oldItem) {
            self.pitems.replace(oldItem, savedItem);
        } else {
            self.pitems.push(savedItem);
        }
    });
    $body.on("drawer.itemDeleted", function (event, deletedItem) {
            self.pitems.remove(_.partial(self.matchById, deletedItem));
    });

}

function NotificationVM($notificationCnt) {
    var self = this;
    self.$notificationCnt = $notificationCnt;

    self.notification = ko.observable(null);
    self.notificationsEnabled = true;

    self.showNotification = function(type,msg) {
        if (self.notificationsEnabled) {
            self.notification({type:type, msg:msg});
            setTimeout(function() {
                self.notification(null);
            }, 2000);
        }
    };
}


function flatObject(obj,ctx) {
    return _.reduce(obj, function (pp, v, k) {
            if (_.isObject(v) && !_.isArray(v) && !_.isElement(v) && !_.isFunction(v) && !_.isDate(v)) {
                return _(pp).extend(flatObject(v, (ctx ? ctx+"."+k : k)));
            } else {
                pp[(ctx ? ctx+"."+k : k)] = v;
                return pp;
            }
        }
        , {});
}

function expandObject(flatobj) {
    return _.reduce(flatobj, function(expobj,v,k) {
        var proppath = k.split(".");
        for (var i = 0,o = expobj;i<proppath.length-1;++i,o=o[proppath[i-1]]) {
            if (o[proppath[i]] === undefined) o[proppath[i]] = {};
        }
        o[proppath.pop()] = v;
        return expobj;
    }, {});
}

function AddEditItemViewModel(drawer,$modal, item) {
    var self = this;
    self.drawer = drawer;
    self.$modal = $modal;
    self.item = item;

    self.data2display = { "ownedFrom" : function (ts) {var d = new Date(ts); return d.getFullYear() + "-" + (d.getMonth()+1) + "-" + d.getDay()},
                            "categories" : function(arr) {return _.isArray(arr) && arr.join(",") || ""}};
    self.display2data = { "ownedFrom" : function (dtstr) {return dtstr && Date.parse(dtstr)},
                          "price.amount" : parseFloat,
                                 "count" : function(c) {return c ? parseFloat(c) : 1},
                            "categories" : function(catstr) {return catstr && _.map(catstr.split(","),function(c){return c.trim()})}};

    var fobj = flatObject(self.item);

    $("[name]",self.$modal).each(function() {
        var field = $(this).attr("name");
        var v = fobj[field];
        v = self.data2display[field] ? self.data2display[field](v) : v;
        $(this).val(v === undefined ? "" : v);
    });

    self.saveItem = function() {
        var kvs = _($("[name]",self.$modal).toArray()).map(function (e) {
            var k = $(e).attr("name"),
                v = $(e).val();
            v = self.display2data[k] ? self.display2data[k](v) : v;
            return [k,v];});
        var flat_item_data = _.object(kvs);
        var item_data = expandObject(flat_item_data);
        drawer.saveItem(new DrawerItem(item_data));
        drawer.save();
    };
}

// setup
(function() {
var notifierVM = new NotificationVM($("#notification"));
var VM = new PinventoryViewModel(drawer, notifierVM);

$("#emptyInventoryBtn").on("click",function() {
    drawer.deleteAll();
});


function addOrEditItem() {
    var drawer_item = drawer.lookupItem($(this).attr("itemId"));
    var $dialog = $("#addEditItemModal");
    var vm = new AddEditItemViewModel(drawer, $dialog, drawer_item ? drawer_item : new DrawerItem({}));
    $dialog.modal('show');
    $("#saveItemBtn").off().on("click", vm.saveItem);
}

$(".addNewItemBtn").on("click", addOrEditItem);
$("#inventoryTab")
    .on("click", ".editItemBtn", addOrEditItem)
    .on("click", ".deleteItemBtn", function() {
        var drawer_item_id = $(this).attr("itemId");
        if (drawer_item_id) {
            drawer.deleteItem(drawer_item_id);
            drawer.save();
        } });

$('a[data-toggle="tab"][href="#statsTab"]').on('shown.bs.tab', showStats);

$("#sortByDateDesc").on("click", function() {
    VM.sortItemsMostRecentFirst();
});

$("#closeWindow").on("click", function() { window.close();});

$(function () {
    ko.applyBindings(notifierVM, notifierVM.$notificationCnt.get(0));
    ko.applyBindings(VM, document.getElementById("inventoryTab"));
});
})();
