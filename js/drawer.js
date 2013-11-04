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
    //self._items = undefined;

    self.genId = function() {
        var newid;
        var _items = self._loadItems();
        do {
            newid = Math.floor(Math.random() * Math.pow(2,50))
        } while (_items[newid]);
        return newid;
    };

    self._loadItems = function() {
        return self._db["Pinventory"] ? JSON.parse(self._db["Pinventory"]) : {};
    };

    self._persistItems = function(items) {
        self._db["Pinventory"] = JSON.stringify(items);
    };

    self.getItems = function() {
        return _(self._loadItems()).values();
        //return _(self._items).values();
    };

    self.reload = function() {
        var _items = self._loadItems();
        // migration script array -> indexed
        _items = _.isArray(_items) ?
            _.chain(_items)
             .map(function(i) {return i["_id"] ? i : _(i).extend({_id:self.genId()});})
             .indexBy("_id")
             .value()
            : _items;
        self.$body.trigger("drawer.itemsLoaded");
    };

    self.reload();

    self.lookupItem = function(_id) {
        var _items = self._loadItems();
        return _items[_id];
    };

    // upsert item
    self.saveItem = function (item) {
        var itemToSave = item["_id"] ? item : _(item).extend({_id:self.genId()}),
            itemInDb = self.lookupItem(item._id);

        var items = self._loadItems();
        items[item._id] = itemToSave;
        var items = self._persistItems(items);

        self.$body.trigger( itemInDb ? "drawer.itemChanged" : "drawer.itemAdded", _(itemToSave).clone());
        return _.clone(itemToSave);
    };

    // add if not yet in db based on ASIN, GTINx
    self.addItem = function(newItem) {
        var _items = self._loadItems();
        var pIDkey = _.intersection(['gtin8', 'gtin13', 'gtin14', 'asin'], _.keys(newItem)).pop();
        var pID = pIDkey && newItem[pIDkey];
        var product_found_in_inventory = pID && _.find(
            _(_items).values(), function(i) {
                return i[pIDkey] && (i[pIDkey] == pID)
                    && i["ownedFrom"] && (i["ownedFrom"] == newItem["ownedFrom"]);});

        if (!product_found_in_inventory) {
            var savedItem = self.saveItem(newItem);
        }
        return product_found_in_inventory ? false : savedItem;
    };

    self.addItems = function(newItemsArr) {
        return _.map(newItemsArr,function(i){return self.addItem(i)});
    };

    self.deleteItem = function(itemId) {
        var itemToDelete = self.lookupItem(itemId);
        if (itemToDelete) {
            var _items = self._loadItems();
            delete _items[itemId];
            self._persistItems(_items);
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
        $body = $("body"),
        $inventoryTab = $("#inventoryTab");
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
    });

    $inventoryTab.on("drawer.itemAdded", function(event, newItem) {
        self.notifier.showNotification("success", "Just added a "+newItem.name+" to your inventory.")
    });

    $body.on("drawer.itemsLoaded", function() {
        self.pitems(drawer.getItems());
    });

    $body.on("drawer.itemChanged", function(event, savedItem) {
        var oldItem = ko.utils.arrayFirst(self.pitems(), _.partial(self.matchById, savedItem));
        if (oldItem) {
            self.pitems.replace(oldItem, savedItem);
            self.notifier.showNotification("success", "Changes to "+savedItem.name+" have been SAVED.")
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

    self.data2display = { "ownedFrom" : function (ts) {var d = new Date(ts); return d.getFullYear() + "-" + (d.getMonth()+1) + "-" + d.getDate()},
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
    };
}

// setup
(function() {
var notifierVM = new NotificationVM($("#notification"));
var VM = new PinventoryViewModel(drawer, notifierVM);

$("#emptyInventoryBtn").on("click",function() {
    drawer.deleteAll();
});


function Dialog(domEl,opts) {

    var dialogRootId = domEl.id || "dialogxxx";
    opts = _.extend(
        {
            dialogDomId : dialogRootId,
            modalTitle: "Irreversible operation",
            modalMessage: "This operation can't be undone. Are you sure you want to continue?",
            confirmBtnLabel : "Confirm",
            onConfirm : function() {},
            onCancel : function() {}
        }, opts);

    var html = _.template(
        '<div class="modal fade" id="<%= dialogDomId %>" tabindex="-1" role="dialog">'+
        '<div class="modal-dialog"><div class="modal-content">'+
            '<div class="modal-header">'+
                '<button type="button" class="close" data-dismiss="modal" aria-hidden="true">&times;</button>'+
                '<h4 class="modal-title"><%= modalTitle %></h4></div>'+
            '<div class="modal-body"><%= modalMessage %></div>'+
            '<div class="modal-footer">'+
                '<button type="button" class="btn btn-default cancel-button" data-dismiss="modal">Cancel</button>'+
                '<button type="button" class="btn btn-primary confirm-button" data-dismiss="modal"><%= confirmBtnLabel %></button>'+
                '</div></div></div></div>');

    $(domEl).replaceWith(html(opts));
    var $modal = $("#"+dialogRootId)
        .on("click",".confirm-button", opts.onConfirm)
        .on("click",".cancel-button", opts.onCancel);
    return $modal;
}


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
            Dialog(document.getElementById("dialog"), {
                onConfirm: function () {
                    drawer.deleteItem(drawer_item_id);
                }}).modal('show');
        }});

$('a[data-toggle="tab"][href="#statsTab"]').on('shown.bs.tab', showStats);

$("#sortByDateDesc").on("click", function() {
    VM.sortItemsMostRecentFirst();
});

$("#exportTab")
    .on('click','.export-jsonld',function() {
        var jsonld = rdfexport.jsonld.dump(drawer.getItems(), drawer.genId);
        $("#exportField").text(JSON.stringify(jsonld,null," "));})
    .on('click','.select-all-btn', function (event) {
        $("#exportField").select();
    });

$("#closeWindow").on("click", function() { window.close();});

$(function () {
   // ko.applyBindings(notifierVM, notifierVM.$notificationCnt.get(0));
    ko.applyBindings(VM, document.getElementById("inventoryTab"));
});
})();
