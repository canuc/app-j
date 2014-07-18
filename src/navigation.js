App._Navigation = function (window, document, App, Dialog, Scroll, Pages, Stack, Transitions) {
	var navQueue = [],
		navLock  = false,
		current, currentNode;

	function isArrEmpty(map) {
        var empty = true;

        for(var key in map) {
            empty = false;
            break;
        }

        return empty;
    }

    window.onhashchange = function(){
       var hashElements = /#(.+?(\+(.+))?)$/.exec(window.location.hash);
       var wholeStack = App.getStack();
       var allElements = {};

       forEach(wholeStack,function(elem,idx) {
           var currentPageName   = elem[0];
           var params = elem[1];
           var pageKey = currentPageName;

           if (!isArrEmpty(params)) {
               var jsonEncodedParams = JSON.stringify(params);
               var encodedUriComponent = encodeURI(jsonEncodedParams);
               console.log(encodedUriComponent);
               pageKey += "+";
               var newPageKey = pageKey + encodedUriComponent;
               allElements[newPageKey] = idx;
           } else {
               allElements[pageKey] = idx;
           }
       });

       
       if ( hashElements ) {
           var pageHash = hashElements[1];

           if ( pageHash in allElements) {

               var pageToPopTo = allElements[pageHash];
               if ( pageToPopTo === wholeStack.length - 1) {
                    // NO-OP
               }
               else if ( pageToPopTo === ( wholeStack.length -2 ) ) {
                    App.back({hashChange:true});
               }
               else {
                   App.removeFromStack(pageToPopTo,wholeStack.length - 2);
                   App.back({hashChange:true});
               }
           }

       } else {
           // we didn't match soo we are in the root and thus should demolish 
           // the stack...
           if ( wholeStack.length > 1 ) {
               App.removeFromStack(1,wholeStack.length - 1);
           } 
               
           App.back({hashChange:true});
       	}
    };	

	App.current = function () {
		return current;
	};

	App.load = function (pageName, args, options, callback) {
		if (typeof pageName !== 'string') {
			throw TypeError('page name must be a string, got ' + pageName);
		}
		switch (typeof args) {
			case 'function':
				options = args;
				args    = {};
			case 'string':
				callback = options;
				options  = args;
			case 'undefined':
				args = {};
			case 'object':
				break;
			default:
				throw TypeError('page arguments must be an object if defined, got ' + args);
		}
		switch (typeof options) {
			case 'function':
				callback = options;
			case 'undefined':
				options = {};
			case 'object':
				break;
			case 'string':
				options = { transition : options };
				break;
			default:
				throw TypeError('options must be an object if defined, got ' + options);
		}
		switch (typeof callback) {
			case 'undefined':
				callback = function () {};
			case 'function':
				break;
			default:
				throw TypeError('callback must be a function if defined, got ' + callback);
		}

		return loadPage(pageName, args, options, callback);
	};

	App.back = function (pageName, callback, options) {
		switch (typeof pageName) {
			case 'function':
				callback = pageName;
			case 'undefined':
				pageName = undefined;
			case 'string':
				break;
			default:
				throw TypeError('pageName must be a string if defined, got ' + pageName);
		}

		switch (typeof callback) {
			case 'undefined':
				callback = function () {};
			case 'function':
				break;
			default:
				throw TypeError('callback must be a function if defined, got ' + callback);
		}

		options = options || {};

		return navigateBack(pageName, callback, options);
	};

	App.pick = function (pageName, args, options, loadCallback, callback) {
		if (typeof pageName !== 'string') {
			throw TypeError('page name must be a string, got ' + pageName);
		}
		switch (typeof args) {
			case 'function':
				options = args;
				args    = {};
			case 'string':
				callback     = loadCallback;
				loadCallback = options;
				options      = args;
			case 'undefined':
				args = {};
			case 'object':
				break;
			default:
				throw TypeError('page arguments must be an object if defined, got ' + args);
		}
		switch (typeof options) {
			case 'function':
				callback     = loadCallback;
				loadCallback = options;
			case 'undefined':
				options = {};
			case 'object':
				break;
			case 'string':
				options = { transition : options };
				break;
			default:
				throw TypeError('options must be an object if defined, got ' + options);
		}
		if (typeof loadCallback !== 'function') {
			throw TypeError('callback must be a function, got ' + loadCallback);
		}
		switch (typeof callback) {
			case 'undefined':
				callback     = loadCallback;
				loadCallback = function () {};
			case 'function':
				break;
			default:
				throw TypeError('callback must be a function, got ' + callback);
		}

		return pickPage(pageName, args, options, loadCallback, callback);
	};

	return {
		getCurrentNode : getCurrentNode ,
		update         : updateCurrentNode ,
		enqueue        : navigate
	};



	function navigate (handler, dragTransition) {
		if (navLock) {
			navQueue.push(handler);
			return false;
		}

		navLock = true;
		if ( !dragTransition ) {
			Transitions.disableDrag();
		}

		handler(function () {
			Stack.save();

			navLock = false;
			if ( !processNavigationQueue() ) {
				Transitions.enableDrag();
			}
		});

		return true;
	}

	function processNavigationQueue () {
		if ( navQueue.length ) {
			navigate( navQueue.shift() );
			return true;
		} else {
			return false;
		}
	}



	function getCurrentNode () {
		return currentNode;
	}

	function updateCurrentNode () {
		var lastStackItem = Stack.getCurrent();
		current = lastStackItem[0]
		currentNode = lastStackItem[3];
	}

	function loadPage (pageName, args, options, callback, setupPickerMode) {
		navigate(function (unlock) {
			var oldNode     = currentNode,
				pageManager = Pages.createManager(false);

			if (setupPickerMode) {
				setupPickerMode(pageManager);
			}

			var page           = Pages.startGeneration(pageName, pageManager, args),
				restoreData    = Stack.getCurrent(),
				restoreNode    = restoreData && restoreData[3],
				restoreManager = restoreData && restoreData[2];

			if (!options.transition && pageManager.transition) {
				options.transition = pageManager.transition;
			}

			Pages.populateBackButton(page, oldNode || restoreNode);

			if ( !current ) {
				App.restore = null;
				document.body.appendChild(page);
				Pages.fire(pageManager, page, Pages.EVENTS.LAYOUT);
				updatePageData();
				finish();
			} else {
				Scroll.saveScrollPosition(currentNode);
				var newOptions = {};
				for (var key in options) {
					newOptions[key] = options[key];
				}
				uiBlockedTask(function (unlockUI) {
					Transitions.run(currentNode, page, newOptions, function () {
						Pages.fixContent(page);
						unlockUI();
						finish();
					});
					Pages.fire(pageManager, page, Pages.EVENTS.LAYOUT);
				});
				//TODO: what if instant swap?
				updatePageData();
			}

			function updatePageData () {
				current     = pageName;
				currentNode = page;
				Stack.push([ pageName, args, pageManager, page, options ]);

				if (oldNode ) {

					window.location.hash = pageName + "+" + encodeURI(JSON.stringify(args));

					if (restoreManager ) {
						Pages.fire(restoreManager, oldNode, Pages.EVENTS.FORWARD);
					}
				}
			}

			function finish () {
				Scroll.saveScrollStyle(oldNode);
				Pages.finishGeneration(pageName, pageManager, page, args);

				unlock();
				callback();

				if (oldNode && restoreManager) {
					restoreManager.showing = false
					Pages.fire(restoreManager, oldNode, Pages.EVENTS.HIDE);
				}
				pageManager.showing = true;
				Pages.fire(pageManager, page, Pages.EVENTS.SHOW);
			}
		});

		if ( !Pages.has(pageName) ) {
			return false;
		}
	}

	function navigateBack (backPageName, callback, options ) {
		options = options || {};

		if (Dialog.status() && Dialog.close() && !backPageName) {
			callback();
			return;
		}

		var stack = Stack.get().map(function (page) {
			return page[0];
		});

		if ( !stack.length ) {
			throw Error(backPageName+' is not currently in the stack, cannot go back to it');
		}

		if (backPageName) {
			var index = -1;
			for (var i=stack.length-1; i>=0; i--) {
				if (stack[i] === backPageName) {
					index = i;
					break;
				}
			}
			if (index === -1) {
				throw Error(backPageName+' is not currently in the stack, cannot go back to it');
			}
			if (index !== stack.length-2) {
				App.removeFromStack(index+1);
			}
		}

		var stackLength = stack.length,
			cancelled   = false;
			
		function backCompleted() {
			if ( !options.hashChange ) {
		        // Make sure this occurs after the element has been popped from the stack
		        // to ensure that we will not see the page in the stack
		        // and thus ignore the hashchange event
		        window.history.back();
		    }
		}

		var navigatedImmediately = navigate(function (unlock) {
			if (Stack.size() < 2) {
				unlock();
				
				backCompleted();

				return;
			}

			var oldPage = Stack.getCurrent();

			if ( !Pages.fire(oldPage[2], oldPage[3], Pages.EVENTS.BEFORE_BACK) ) {
				cancelled = true;
				unlock();
				return;
			}
			else {
				Stack.pop();
			}

			var data       = Stack.getCurrent(),
				pageName   = data[0],
				page       = data[3],
				oldOptions = oldPage[4];

			Pages.fire(oldPage[2], oldPage[3], Pages.EVENTS.BACK);

			Pages.fixContent(page);

			Pages.startDestruction(oldPage[0], oldPage[2], oldPage[3], oldPage[1]);

			Scroll.restoreScrollPosition(page);

			var newOptions = {};
			for (var key in oldOptions) {
				if (key === 'transition') {
					newOptions[key] = Transitions.REVERSE_TRANSITION[ oldOptions[key] ] || oldOptions[key];
				}
				else {
					newOptions[key] = oldOptions[key];
				}
			}

			uiBlockedTask(function (unlockUI) {
				Transitions.run(currentNode, page, newOptions, function () {
					Pages.fixContent(page);
					Scroll.restoreScrollStyle(page);
					unlockUI();

					oldPage[2].showing = false
					Pages.fire(oldPage[2], oldPage[3], Pages.EVENTS.HIDE);
					data[2].showing = true
					Pages.fire(data[2], page, Pages.EVENTS.SHOW);

					setTimeout(function () {
						Pages.finishDestruction(oldPage[0], oldPage[2], oldPage[3], oldPage[1]);

						unlock();

						backCompleted();

						callback();
					}, 0);
				}, true);
				Pages.fixContent(page);
				Pages.fire(data[2], page, Pages.EVENTS.LAYOUT);
			});

			current     = pageName;
			currentNode = page;
		});

		if (cancelled || (navigatedImmediately && (stackLength < 2))) {
			return false;
		}
	}

	function pickPage (pageName, args, options, loadCallback, callback) {
		var finished = false;
		loadPage(pageName, args, options, loadCallback, function (pageManager) {
			pageManager.restorable = false;
			pageManager.reply = function () {
				if ( !finished ) {
					finished = true;
					if ( !pageManager._appNoBack ) {
						navigateBack(undefined, function(){});
					}
					callback.apply(App, arguments);
				}
			};
		});
	}



	// blocks UI interaction during some aysnchronous task
	// is not locked because multiple calls dont effect eachother
	function uiBlockedTask (task) {
		var taskComplete = false;

		var clickBlocker = document.createElement('div');
		clickBlocker.className = 'app-clickblocker';
		document.body.appendChild(clickBlocker);
		clickBlocker.addEventListener('touchstart', function (e) {
			e.preventDefault();
		}, false);

		task(function () {
			if (taskComplete) {
				return;
			}
			taskComplete = true;

			document.body.removeChild(clickBlocker);
		});
	}
}(window, document, App, App._Dialog, App._Scroll, App._Pages, App._Stack, App._Transitions);
