( function()
{
	'use strict';
	
	var FoundState =
	{
		None: 0,
		Process: 1,
		Added: 2,
		DisableButtons: 3
	};
	
	var i,
	    link,
	    giftCache = {},
	    hasLinksEnabled = document.body.dataset.steamdbLinks === 'true',
	    hasPreciseSubIDsEnabled = document.body.dataset.steamdbGiftSubid === 'true',
	    homepage = document.getElementById( 'steamdb_inventory_hook' ).dataset.homepage,
	    originalPopulateActions = window.PopulateActions,
	    fixCommunityUrls = !!document.getElementById( 'steamdb_https_fix' );
	
	var hasQuickSellEnabled = document.body.dataset.steamdbQuickSell === 'true' && window.g_bViewingOwnProfile;
	var originalPopulateMarketActions = window.PopulateMarketActions;
	
	var dummySellEvent =
	{
		stop: function()
		{
			
		}
	};
	
	var quickSellButton = function( )
	{
		window.SellCurrentSelection();
		
		document.getElementById( 'market_sell_currency_input' ).value = this.dataset.price;
		document.getElementById( 'market_sell_dialog_accept_ssa' ).checked = true;
		
		window.SellItemDialog.OnInputKeyUp( null ); // Recalculate prices
		window.SellItemDialog.OnAccept( dummySellEvent );
		
		if( document.body.dataset.steamdbQuickSellAuto )
		{
			window.SellItemDialog.OnConfirmationAccept( dummySellEvent );
		}
	};
	
	if( document.body.dataset.steamdbNoSellReload )
	{
		var nextRefreshCausedBySell = false;
		var originalOnConfirmationAccept = window.SellItemDialog.OnConfirmationAccept;
		var originalReloadInventory = window.CUserYou.prototype.ReloadInventory;
		
		window.SellItemDialog.OnConfirmationAccept = function( )
		{
			nextRefreshCausedBySell = true;
			
			originalOnConfirmationAccept.apply( this, arguments );
		};
		
		window.CUserYou.prototype.ReloadInventory = function( )
		{
			if( nextRefreshCausedBySell )
			{
				nextRefreshCausedBySell = false;
				
				window.g_ActiveInventory.selectedItem.element.style.opacity = 0.2;
			}
			else
			{
				originalReloadInventory.apply( this, arguments );
			}
		};
	}
	
	window.PopulateMarketActions = function( elActions, item )
	{
		var realIsTrading       = window.g_bIsTrading;
		var realIsMarketAllowed = window.g_bMarketAllowed;
		
		if( !window.g_bViewingOwnProfile )
		{
			window.g_bIsTrading     = true; // Hides sell button
			window.g_bMarketAllowed = true; // Has to be set so Valve's code doesn't try to bind a tooltip on non existing sell button
		}
		
		originalPopulateMarketActions.apply( this, arguments );
		
		window.g_bIsTrading     = realIsTrading;
		window.g_bMarketAllowed = realIsMarketAllowed;
		
		if( hasQuickSellEnabled && item.marketable && !item.is_currency && elActions.style.display !== 'none' )
		{
			var buttons = document.createElement( 'span' );
			buttons.style.float = 'right';
			
			var listNowText = document.createElement( 'span' );
			listNowText.textContent = 'List now (…)';
			
			var listNow = document.createElement( 'a' );
			listNow.title = 'Lists the item for lowest listed sell price\n\nDisplayed price is the money you receive (without fees)';
			listNow.href = 'javascript:void(0)';
			listNow.className = 'btn_small btn_blue_white_innerfade';
			listNow.style.opacity = 0.5;
			listNow.appendChild( listNowText );
			
			var sellNowText = document.createElement( 'span' );
			sellNowText.textContent = 'Sell now (…)';
			
			var sellNow = document.createElement( 'a' );
			sellNow.title = 'Lists the item for highest listed buy order price\n\nDisplayed price is the money you receive (without fees)';
			sellNow.href = 'javascript:void(0)';
			sellNow.className = 'btn_small btn_blue_white_innerfade';
			sellNow.style.opacity = 0.5;
			sellNow.appendChild( sellNowText );
			
			buttons.appendChild( listNow );
			buttons.appendChild( document.createTextNode( ' ' ) );
			buttons.appendChild( sellNow );
				
			elActions.appendChild( buttons );
			
			var xhr = new XMLHttpRequest();
			xhr.onreadystatechange = function()
			{
				if( xhr.readyState === 4 && xhr.status === 200 )
				{
					var data = xhr.response;
					
					var commodityID = data.match( /Market_LoadOrderSpread\(\s?(\d+)\s?\);/ );
					
					if( !commodityID )
					{
						sellNowText.textContent = 'Sell now (error)';
						listNowText.textContent = 'List now (error)';
						
						return;
					}
					
					xhr = new XMLHttpRequest();
					xhr.onreadystatechange = function()
					{
						if( xhr.readyState === 4 && xhr.status === 200 )
						{
							data = xhr.response;
							
							if( !data.success )
							{
								sellNowText.textContent = 'Sell now (error)';
								listNowText.textContent = 'List now (error)';
								
								return;
							}
							
							var publisherFee = typeof item.market_fee !== 'undefined' ? item.market_fee : window.g_rgWalletInfo.wallet_publisher_fee_percent_default;
							var listNowFee = window.CalculateFeeAmount( data.lowest_sell_order, publisherFee );
							var listNowPrice = ( data.lowest_sell_order - listNowFee.fees ) / 100;
							var sellNowPrice = 0.0;
							
							listNow.style.removeProperty( 'opacity' );
							listNow.dataset.price = listNowPrice;
							listNow.addEventListener( 'click', quickSellButton );
							listNowText.textContent = 'List now (' + data.price_prefix + listNowPrice + data.price_suffix + ')';
							
							if( data.highest_buy_order )
							{
								var sellNowFee = window.CalculateFeeAmount( data.highest_buy_order, publisherFee );
								sellNowPrice = ( data.highest_buy_order - sellNowFee.fees ) / 100;
								
								sellNow.style.removeProperty( 'opacity' );
								sellNow.dataset.price = sellNowPrice;
								sellNow.addEventListener( 'click', quickSellButton );
								sellNowText.textContent = 'Sell now (' + data.price_prefix + sellNowPrice + data.price_suffix + ')';
							}
							else
							{
								sellNowText.style.display = 'none';
							}
						}
					};
					xhr.open( 'GET', '//steamcommunity.com/market/itemordershistogram?language=english'
						+ '&country=' + window.g_rgWalletInfo.wallet_country
						+ '&currency=' + window.g_rgWalletInfo.wallet_currency
						+ '&item_nameid=' + commodityID[ 1 ], true );
					xhr.responseType = 'json';
					xhr.send();
				}
			};
			xhr.open( 'GET', '//steamcommunity.com/market/listings/' + item.appid + '/' + encodeURIComponent( window.GetMarketHashName( item ) ), true );
			xhr.send();
		}
	};
	
	window.PopulateActions = function( elActions, rgActions, item, owner )
	{
		var foundState = FoundState.None;
		
		try
		{
			// PopulateActions is called for both item.actions and item.owner_actions, we only want first one
			if( hasLinksEnabled && item.appid == 753 && rgActions === item.actions )
			{
				if( item.type === 'Coupon' && rgActions )
				{
					var couponLink, pos;
					
					for( i = 0; i < rgActions.length; i++ )
					{
						link = rgActions[ i ];
						
						if( link.steamdb )
						{
							foundState = FoundState.Added;
							
							break;
						}
						else if( link.link )
						{
							pos = link.link.indexOf( 'list_of_subs=' );
							
							if( pos > 0 )
							{
								couponLink = link.link;
								
								foundState = FoundState.Process;
							}
						}
					}
					
					if( foundState === FoundState.Process )
					{
						var subs = couponLink.substring( pos + 'list_of_subs='.length ).split( ',' );
						
						for( i = 0; i < subs.length; i++ )
						{
							rgActions.push( {
								steamdb: true,
								link: homepage + 'sub/' + subs[ i ] + '/?utm_source=Steam&utm_medium=Steam&utm_campaign=SteamDB%20Extension',
								name: 'View ' + subs[ i ] + ' on Steam Database'
							} );
						}
						
						foundState = FoundState.Added;
					}
				}
				else if( hasPreciseSubIDsEnabled && item.owner_actions && item.type === 'Gift' )
				{
					// If a gift has no actions, rgActions is undefined
					if( !rgActions )
					{
						rgActions = [];
					}
					
					for( i = 0; i < rgActions.length; i++ )
					{
						link = rgActions[ i ];
						
						if( link.steamdb )
						{
							if( link.link.match( /^#steamdb_/ ) !== null )
							{
								rgActions[ i ].link = homepage + 'sub/' + giftCache[ item.classid ] + '/?utm_source=Steam&utm_medium=Steam&utm_campaign=SteamDB%20Extension';
							}
							
							foundState = FoundState.Added;
							
							break;
						}
					}
					
					if( foundState !== FoundState.Added )
					{
						foundState = FoundState.DisableButtons;
						
						var action =
						{
							steamdb: true,
							link: '#steamdb_' + item.id,
							name: 'View on Steam Database'
						};
						
						if( giftCache[ item.classid ] )
						{
							action.link = homepage + 'sub/' + giftCache[ item.classid ] + '/?utm_source=Steam&utm_medium=Steam&utm_campaign=SteamDB%20Extension';
						}
						else
						{
							var xhr = new XMLHttpRequest();
							xhr.onreadystatechange = function()
							{
								if( xhr.readyState === 4 && xhr.status === 200 && xhr.response.packageid )
								{
									giftCache[ item.classid ] = xhr.response.packageid;
									
									link = elActions.querySelector( '.item_actions a[href="#steamdb_' + item.id + '"]' );
									
									if( link )
									{
										link.classList.remove( 'btn_disabled' );
										link.href = homepage + 'sub/' + xhr.response.packageid + '/?utm_source=Steam&utm_medium=Steam&utm_campaign=SteamDB%20Extension';
									}
								}
							};
							xhr.open( 'GET', '//steamcommunity.com/gifts/' + item.id + '/validateunpack', true );
							xhr.responseType = 'json';
							xhr.send();
						}
						
						rgActions.push( action );
					}
				}
				else if( rgActions )
				{
					for( i = 0; i < rgActions.length; i++ )
					{
						link = rgActions[ i ];
						
						if( link.steamdb )
						{
							foundState = FoundState.Added;
							
							break;
						}
						else if( link.link && link.link.match( /\.com\/(app|sub)\// ) )
						{
							foundState = FoundState.Process;
						}
					}
					
					if( foundState === FoundState.Process )
					{
						for( i = 0; i < rgActions.length; i++ )
						{
							link = rgActions[ i ].link;
							
							if( !link )
							{
								continue;
							}
							
							link = link.match( /\.com\/(app|sub)\/([0-9]{1,6})/ );
							
							if( link )
							{
								rgActions.push( {
									steamdb: true,
									link: homepage + link[ 1 ] + '/' + link[ 2 ] + '/?utm_source=Steam&utm_medium=Steam&utm_campaign=SteamDB%20Extension',
									name: 'View on Steam Database'
								} );
								
								foundState = FoundState.Added;
								
								break;
							}
						}
					}
				}
				else if( item.type === 'Gift' )
				{
					link = item.name.match( /^Unknown package ([0-9]+)$/ );
					
					if( link )
					{
						item.actions = rgActions = [ {
							steamdb: true,
							link: homepage + 'sub/' + link[ 1 ] + '/?utm_source=Steam&utm_medium=Steam&utm_campaign=SteamDB%20Extension',
							name: 'View on Steam Database'
						} ];
					}
					else
					{
						item.actions = rgActions = [ {
							steamdb: true,
							link: homepage + 'search/?a=sub&q=' + encodeURIComponent( item.name ),
							name: 'Search on Steam Database'
						} ];
					}
					
					
					foundState = FoundState.Added;
				}
			}
			
			// https fix
			if( fixCommunityUrls && rgActions )
			{
				for( i = 0; i < rgActions.length; i++ )
				{
					link = rgActions[ i ].link;
					
					if( link )
					{
						rgActions[ i ].link = link.replace( /^http:\/\/steamcommunity\.com/, 'https://steamcommunity.com' );
					}
				}
			}
		}
		catch( e )
		{
			// Don't break website functionality if something fails above
		}
		
		originalPopulateActions( elActions, rgActions, item, owner );
		
		// We want our links to be open in new tab
		if( foundState === FoundState.Added )
		{
			link = elActions.querySelectorAll( '.item_actions a[href^="' + homepage + '"]' );
			
			if( link )
			{
				for( i = 0; i < link.length; i++ )
				{
					link[ i ].target = '_blank';
				}
			}
		}
		else if( foundState === FoundState.DisableButtons )
		{
			link = elActions.querySelectorAll( '.item_actions a[href^="#steamdb_"]' );
			
			if( link )
			{
				for( i = 0; i < link.length; i++ )
				{
					link[ i ].target = '_blank';
					link[ i ].classList.add( 'btn_disabled' );
				}
			}
		}
	};
}() );
