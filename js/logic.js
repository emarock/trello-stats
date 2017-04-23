var TrelloStats = (function() {
  google.charts.load('current', {
    packages: [
      'corechart'
    ]
  });

  var my = {};

  var chart;
  
  function getLists() {
    console.log('Retrieving lists');
    $('#lists').html('');
    $('#lists').hide();
    $('#chart').hide();
    var url = '/boards/' + $('#boards').val() + '/lists';
    Trello.get(url, function(lists) {
      console.log('Lists retrieved');
      $('#lists').show(1);
      $('#lists').append(
	'<option selected disabled>Select List</option>'
      );
      async.each(lists, function(list, callback) {
	$('#lists').append(
	  '<option value="' + list.id + '">' + list.name + '</option>'
	);
	return callback();
      });
    }, function(err) {
      console.error(err);
    });
  }

  function getData(list, filter, callback) {
    console.log('Retrieving data from list ' + list);
    async.parallel({
      actions: function(callback) {
	var url = '/lists/' + list + '/actions?limit=1000' +
	    '&filter=createCard,deleteCard,updateCard';
	Trello.get(url, function(actions) {
	  return callback(null, actions);
	}, function(err) {
	  return callback(err)
	});
      },
      cards: function(callback) {
	var url = '/lists/' + list + '/cards';
	Trello.get(url, function(cards) {
	  if (filter) {
	    var filtered = [];
	    async.forEachOf(cards, function(card, idx, callback) {
	      if (filter[card.id]) {
		filtered.push(card);
	      }
	    });
	    cards = filtered;
	  }
	  return callback(null, cards);
	}, function(err) {
	  return callback(err)
	});
      }
    }, function(err, results) {
      if (err) {
	return callback(err);
      } else {
	console.log('Data retrieved from list ' + list);
	
	var data = {};
	var cards = {};
	var lists = {};
	var desc, prev, current = results.cards.length;
	async.each(results.actions, function(action, callback) {
	  if (!action.data || !action.data.card ||
	      (filter && !filter[action.data.card.id])) {
	    return callback();
	  }
	  switch(action.type) {
	  case 'createCard':
	    desc = 'Card created: ';
	    prev = current - 1;
	    break;
	  case 'deleteCard':
	    desc = 'Card deleted: '
	    prev = current + 1;
	    break;
	  case 'updateCard':
	    if (action.data.listBefore) {
	      if (action.data.listBefore.id === list) {
		lists[action.data.listAfter.id] = action.data.listAfter;
		cards[action.data.card.id] = true;
		prev = current + 1;
		desc = 'Card moved to ' + action.data.listAfter.name + ': ';
	      } else {
		prev = current - 1;
		desc = 'Card moved from ' + action.data.listBefore.name + ': ';
	      }
	    } else if (action.data.old &&
		       action.data.old.closed === false) {
	      desc = 'Card closed: ';
	      prev = current + 1;
	    } else {
	      return callback();
	    }
	    break;
	  default:
	    return callback();
	  }

	  data[new Date(action.date)] = {
	    value: current,
	    tooltip: desc + action.data.card.name,
	    style: 'point {color: ' + (prev < current ? 'red' : 'green') + '}'
	  }
	  
	  current = prev;
	  return callback();
	});
      }
      return callback(null, data, cards, lists);
    });
  }

  function getChart2(list, callback) {
    async.waterfall([
      function(callback) {
	getData(list, null, callback);
      },
      function(data, cards, lists, callback) {
	async.map(lists, function(list, callback) {
	  getData(list.id, cards, callback);	  
	}, function(err, results) { // map
	  if (err) {
	    return callback(err);
	  } else {
	    async.each(Object.keys(results), function(id, callback) {
	      results[lists[id].name] = results[id];
	      delete results[id];
	      return callback();
	    });
	    return callback(null, data, results);
	  }
	});	
      },
      function(primary, others, callback) {
	others[$('option[value=' + $('#lists').val() + ']').text()] = primary;
	return callback(null, others);
      },
      function(data, callback) {
	var keys = {};
	async.each(data, function(data, callback) {
	  async.each(Object.keys(data), function(key, callback) {
	    keys[key] = true;
	    return callback();
	  });
	  return callback();
	});
	return callback(null, Object.keys(keys), data);
      },
      function(dates, data, callback) {
	var main = $('option[value=' + $('#lists').val() + ']').text();
	var lists = [
	  main
	];
	async.each(Object.keys(data), function(list, callback) {
	  if (list !== main) {
	    lists.push(list);
	  }
	  return callback();
	});
	return callback(null, lists, dates, data);
      },
      function(lists, dates, data, callback) {
	var rows = [];
	async.each(dates, function(date, callback) {
	  var row = [
	    new Date(date)
	  ];
	  async.each(lists, function(list, callback) {
	    row.push((data[list][date] ? data[list][date].value : null));
	    row.push((data[list][date] ? data[list][date].tooltip : null));
	    row.push((data[list][date] ? data[list][date].style : null));
	    return callback();
	  });
	  rows.push(row);
	  return callback();
	});
	return callback(null, lists, rows);
      },
      function(lists, rows, callback) {
	rows.sort(function(a, b) {
	  return a[0] - b[0];
	});
	callback(null, lists, rows);
      },
      function(lists, rows, callback) {
	var data = new google.visualization.DataTable();
	data.addColumn('datetime', 'Date');
	async.each(lists, function(list, callback) {
	  data.addColumn('number', list);
	  data.addColumn({type: 'string', role: 'tooltip'})
	  data.addColumn({type: 'string', role: 'style'})
	  return callback();
	});
	async.each(rows, function(row, callback) {
	  data.addRow(row);
	  return callback();
	});
	return callback(null, data);
      },
      function(data, callback) {
	var options = {
	  title: 'Cards Flow from ' +
	    $('option[value=' + $('#lists').val() + ']').text(),
	  pointsVisible: true,
	  interpolateNulls: true,
	  height: 500,
	  explorer: {},
	  trendlines: {
	    0: {
	      tooltip: false,
	      pointsVisible: false
	    }
	  }
	};
	$('#chart').show();
	var div = $('#chart')[0];
	var chart = new google.visualization.LineChart(div);
	chart.draw(data, options);
	return callback(null, data);
      }
    ], function(err, data) { // waterfall
      callback(err, data);
    });
  }

  function getChart(list, filter) {
    console.log('Cleanup')
    console.log('Retrieving chart');
    async.parallel({
      actions: function(callback) {
	var url = '/lists/' + list + '/actions?limit=1000' +
	    '&filter=createCard,deleteCard,updateCard';
	Trello.get(url, function(actions) {
	  return callback(null, actions);
	}, function(err) {
	  return callback(err)
	});
      },
      cards: function(callback) {
	var url = '/lists/' + list + '/cards';
	Trello.get(url, function(cards) {
	  if (filter) {
	    var filtered = [];
	    async.forEachOf(cards, function(card, idx, callback) {
	      if (filter[card.id]) {
		filtered.push(card);
	      }
	    });
	    cards = filtered;
	  }
	  return callback(null, cards);
	}, function(err) {
	  return callback(err)
	});
      }
    }, function(err, results) {
      if (err) {
	console.error(err);
      } else {
	console.log(results);
	console.log('Chart retrieved');
	$('#chart').show();

	var data = new google.visualization.DataTable();
	data.addColumn('datetime', 'Date');
	data.addColumn('number', 'Cards');
	data.addColumn({type: 'string', role: 'tooltip'})
	data.addColumn({type: 'string', role: 'style'})

	var desc, prev, current = results.cards.length;
	var cards = {};
	var lists = {};
	async.each(results.actions, function(action, callback) {
	  if (!action.data || !action.data.card ||
	      (filter && !filter[action.data.card.id])) {
	    return callback();
	  }
	  switch(action.type) {
	  case 'createCard':
	    desc = 'Card created: ';
	    prev = current - 1;
	    break;
	  case 'deleteCard':
	    desc = 'Card deleted: '
	    prev = current + 1;
	    break;
	  case 'updateCard':
	    if (action.data.listBefore) {
	      if (action.data.listBefore.id === list) {
		lists[action.data.listAfter.id] = true;
		cards[action.data.card.id] = true;
		prev = current + 1;
		desc = 'Card moved to ' + action.data.listAfter.name + ': ';
	      } else {
		prev = current - 1;
		desc = 'Card moved from ' + action.data.listBefore.name + ': ';
	      }
	    } else if (action.data.old &&
		       action.data.old.closed === false) {
	      desc = 'Card closed: ';
	      prev = current + 1;
	    } else {
	      return callback();
	    }
	    break;
	  default:
	    return callback();
	  }

	  data.addRow([
	    new Date(action.date),
	    current,
	    desc + action.data.card.name,
	    'point {color: ' + (prev < current ? 'red' : 'green') + '}'
	  ]);
	  current = prev;
	  return callback();
	});
	var now = new Date();
	var max = new Date();
	var min = new Date();
	max.setDate(now.getDate() + 5);
	min.setDate(now.getDate() - 15);
	var options = {
	  title: $('option[value=' + list + ']').text(),
	  pointsVisible: true,
	  height: 500,
	  hAxis: {
	    viewWindow: {
	      max: max,
	      min: min
	    }
	  },
	  explorer: {},
	  trendlines: {
	    0: {
	      tooltip: false,
	      pointsVisible: false
	    }
	  }
	};
	if (!chart) {
	  var div = $('#chart')[0];
	  chart = new google.visualization.LineChart(div);
	}
	chart.draw(data, options);
	if (!filter) {
	  async.each(Object.keys(lists), function(list, callback) {
	    getChart(list, cards, chart);
	  });
	}
	console.log({lists: lists, cards: cards})
      }
    });
  }
  
  my.start = function() {
    $('#boards').hide();
    $('#lists').hide();
    $('#chart').hide();
    console.log('Authenticating with Trello');
    async.waterfall([
      function(callback) {
	Trello.authorize({
	  type: 'redirect',
	  name: 'Trello Stats',
	  scope: {
	    read: true
	  },
	  expiration: "never",
	  success: function() {
	    console.log('Authenticated');
	    return callback();
	  },
	  error: function() {
	    return callback(new Error('Authentication Failed'));
	  }
	});
      },
      function(callback) {
	console.log('Retrieving boards');
	Trello.get('/member/me/boards', function(boards) {
	  console.log('Boards retrieved');
	  return callback(null, boards);
	}, function(err) {
	  return callback(err);
	});
      },
      function(boards, callback) {
	$('#boards').show(1);
	$('#boards').append(
	  '<option selected disabled>Select Board</option>'
	);

	async.each(boards, function(board, callback) {
	  $('#boards').append(
	    '<option value="' + board.id + '">' + board.name + '</option>'
	  );
	  return callback();
	});
	$('#boards').change(getLists);
	$('#lists').change(function() {
	  // getData($('#lists').val(), null, function(err, data, cards, lists) {
	  getChart2($('#lists').val(), function(err, data) {
	    if (err) {
	      console.error(err);
	    } else {
	      console.log('Data retrieved');
	      console.log(data);
	      // console.log({
	      // 	data: data,
	      // 	cards: cards,
	      // 	lists: lists
	      // });
	    }
	  });
	});
	return callback();
      }
    ], function(err, result) {
      if (err) {
	console.error(err);
      }
    });
  }

  return my;
})();
