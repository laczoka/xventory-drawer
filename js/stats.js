_.mixin({
    mapValues : function(obj, func) {
        return _.reduce(obj, function(o,v,k) {
            o[k] = func(v);return o;
        }, {});
    }
});

var Currencies = ["EUR", "GBP", "USD"];

function priceCurrency(priced) {
    var bought = priced['price'] && parseFloat(priced.price['amount']) && _(Currencies).contains(priced.price['currency']);
    return bought ? priced.price.currency : "";
}

function yearOfAcquisition(item) {
    return parseFloat(item['ownedFrom']) ?
        (new Date(parseFloat(item.ownedFrom))).getFullYear() : NaN;
}

function sumArray(arr_num) {
    var sum = 0;
    for (var i=arr_num.length-1; 0<=i; i--) {
        sum += arr_num[i];
    }
    return sum;
}

// sumPricesByYear :: [Priced] -> {sumAmount,Year}
function sumPricesByYear(arr_priced) {
    return _.chain(arr_priced)
            .groupBy(yearOfAcquisition)
            .mapValues(function(arr_priced){return sumArray(_.chain(arr_priced).pluck("price").pluck("amount").value())})
            .value();
}

// toChartDataset :: annStat -> ChartJSChartData
function toChartDataset(annStat) {
    return _.reduce(annStat, function(aggrv, stat, currency) {
            aggrv.labels = aggrv['labels'] || _.keys(stat);
            var ds = {fillColor : "rgba(151,187,205,0.5)",
                    strokeColor : "rgba(151,187,205,1)",
                         suffix : " " + currency,
                           data : []};
            ds.data = _.chain(stat).pairs().sortBy(function(x){return x[0]}).pluck(1).value();
            aggrv.datasets.push(ds);
            return aggrv;
        },
        { labels: null, datasets: []});
}


// calculateYearlyStats :: [Item] -> ChartJSChartData
function calculateAnnualStats(arr_item) {
    var annStat = _.chain(arr_item)
                   .groupBy(priceCurrency)
                   .omit("")
                   .mapValues(sumPricesByYear)
                   .value();

    var years = _.chain(annStat)
                 .reduce(function(years,sumPerAnn){return _.union(years, _.keys(sumPerAnn))},[])
                 .uniq()
                 .value();

    var yearsSum0 = _.object(years, _.map(_.range(0,years.length,0),function(x){return 0}));

    var annStatp = _.mapValues(annStat,function(sumPerAnn){return _.extend(yearsSum0, sumPerAnn)});

    return toChartDataset(annStatp);
}

function showStats() {
    /*var barChartData = {
        labels : ["2010","2011","2012","2013"],
        datasets : [
            {
                fillColor : "rgba(151,187,205,0.5)",
                strokeColor : "rgba(151,187,205,1)",
                data : [465,359,442,591],
                suffix : " EUR"
            },
            {
                fillColor : "rgba(151,187,205,0.5)",
                strokeColor : "rgba(151,187,205,1)",
                data : [465,359,442,591],
                suffix : " GBP"
            }
        ]

    };*/

    var barChartOpts = { valueOnTop : true };

    var annualStatsPerCurrency = calculateAnnualStats(drawer.getItems());
    if (annualStatsPerCurrency.labels && annualStatsPerCurrency.labels.length > 0) {
        var myAnnualSpending = new Chart(document.getElementById("annualSpendingCanvas")
            .getContext("2d"))
            .Bar(annualStatsPerCurrency, barChartOpts);
    }
}