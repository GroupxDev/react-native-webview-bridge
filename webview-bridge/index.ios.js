/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * Copyright (c) 2016-present, Ali Najafizadeh
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule WebViewBridge
 * @flow
 */
'use strict';

var React = require('react');
var ReactNative = require('react-native');
var invariant = require('invariant');
var keyMirror = require('keymirror');
var resolveAssetSource = require('react-native/Libraries/Image/resolveAssetSource');
var PropTypes = require('prop-types');

var {
  ActivityIndicator,
  EdgeInsetsPropType,
  StyleSheet,
  Text,
  View,
  WebView,
  requireNativeComponent,
  UIManager,
  Alert,
  NativeModules: {
    WebViewBridgeManager
  }
} = ReactNative;

var BGWASH = 'rgba(255,255,255,0.8)';
var RCT_WEBVIEWBRIDGE_REF = 'webviewbridge';

var RCTWebViewBridgeManager = WebViewBridgeManager;

var WebViewBridgeState = keyMirror({
  IDLE: null,
  LOADING: null,
  ERROR: null,
});

var NavigationType = {
  click: RCTWebViewBridgeManager.NavigationType.LinkClicked,
  formsubmit: RCTWebViewBridgeManager.NavigationType.FormSubmitted,
  backforward: RCTWebViewBridgeManager.NavigationType.BackForward,
  reload: RCTWebViewBridgeManager.NavigationType.Reload,
  formresubmit: RCTWebViewBridgeManager.NavigationType.FormResubmitted,
  other: RCTWebViewBridgeManager.NavigationType.Other,
};

var JSNavigationScheme = RCTWebViewBridgeManager.JSNavigationScheme;

type ErrorEvent = {
  domain: any;
  code: any;
  description: any;
}

type Event = Object;

var defaultRenderLoading = () => (
  <View style={styles.loadingView}>
    <ActivityIndicator/>
  </View>
);
var defaultRenderError = (errorDomain, errorCode, errorDesc) => (
  <View style={styles.errorContainer}>
    <Text style={styles.errorTextTitle}>
      Error loading page
    </Text>
    <Text style={styles.errorText}>
      {'Domain: ' + errorDomain}
    </Text>
    <Text style={styles.errorText}>
      {'Error Code: ' + errorCode}
    </Text>
    <Text style={styles.errorText}>
      {'Description: ' + errorDesc}
    </Text>
  </View>
);

/**
 * Renders a native WebView.
 */
// propTypes = {
//   ...WebView.propTypes,

//   /**
//    * Will be called once the message is being sent from webview
//    */
// };
class WebViewBridge extends React.Component {
  static propTypes = {
    ...WebView.propTypes,
    onBridgeMessage: PropTypes.func,
  
    hideKeyboardAccessoryView: PropTypes.bool,
  
    keyboardDisplayRequiresUserAction: PropTypes.bool,
    shouldCache: PropTypes.bool,
    userScript: PropTypes.string,
    onConfirmDialog: PropTypes.func,
    onAlert: PropTypes.func,
  }
  statics = {
    JSNavigationScheme: JSNavigationScheme,
    NavigationType: NavigationType,
  };
  state = {
    viewState: WebViewBridgeState.IDLE,
    lastErrorEvent: (null: ?ErrorEvent),
    startInLoadingState: true,
  }


  componentWillMount = () => {
    if (this.props.startInLoadingState) {
      this.setState({viewState: WebViewBridgeState.LOADING});
    }
  }

  render() {
    var otherView = null;

    if (this.state.viewState === WebViewBridgeState.LOADING) {
      otherView = (this.props.renderLoading || defaultRenderLoading)();
    } else if (this.state.viewState === WebViewBridgeState.ERROR) {
      var errorEvent = this.state.lastErrorEvent;
      invariant(
        errorEvent != null,
        'lastErrorEvent expected to be non-null'
      );
      otherView = (this.props.renderError || defaultRenderError)(
        errorEvent.domain,
        errorEvent.code,
        errorEvent.description
      );
    } else if (this.state.viewState !== WebViewBridgeState.IDLE) {
      console.error(
        'RCTWebViewBridge invalid state encountered: ' + this.state.loading
      );
    }

    var webViewStyles = [styles.container, styles.webView, this.props.style];
    if (this.state.viewState === WebViewBridgeState.LOADING ||
      this.state.viewState === WebViewBridgeState.ERROR) {
      // if we're in either LOADING or ERROR states, don't show the webView
      webViewStyles.push(styles.hidden);
    }

    var onShouldStartLoadWithRequest = this.props.onShouldStartLoadWithRequest && ((event: Event) => {
      var shouldStart = this.props.onShouldStartLoadWithRequest &&
        this.props.onShouldStartLoadWithRequest(event.nativeEvent);
      RCTWebViewBridgeManager.startLoadWithResult(!!shouldStart, event.nativeEvent.lockIdentifier);
    });

    var {javaScriptEnabled, domStorageEnabled} = this.props;
    if (this.props.javaScriptEnabledAndroid) {
      console.warn('javaScriptEnabledAndroid is deprecated. Use javaScriptEnabled instead');
      javaScriptEnabled = this.props.javaScriptEnabledAndroid;
    }
    if (this.props.domStorageEnabledAndroid) {
      console.warn('domStorageEnabledAndroid is deprecated. Use domStorageEnabled instead');
      domStorageEnabled = this.props.domStorageEnabledAndroid;
    }

    var onBridgeMessage = (event: Event) => {
      const onBridgeMessageCallback = this.props.onBridgeMessage;
      if (onBridgeMessageCallback) {
        const messages = event.nativeEvent.messages;
        if (messages.forEach) {
          messages.forEach((message) => {
            onBridgeMessageCallback(message);
          });
        }
      }
    };

    let {source, ...props} = {...this.props};
    delete props.onBridgeMessage;
    delete props.onShouldStartLoadWithRequest;
    delete props.scalesPageToFit;
    delete props.allowMixedContent;
    delete props.allowWebContentsDebugging;

    var webView =
      <RCTWebViewBridge
        ref={RCT_WEBVIEWBRIDGE_REF}
        key="webViewKey"
        {...props}
        source={resolveAssetSource(source)}
        style={webViewStyles}
        onLoadingStart={this.onLoadingStart}
        onLoadingFinish={this.onLoadingFinish}
        onLoadingError={this.onLoadingError}
        onAlert={this.onAlert}
        onConfirmDialog={this.onConfirmDialog}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onBridgeMessage={onBridgeMessage}
        shouldCache={this.props.shouldCache || false}
      />;

    return (
      <View style={styles.container}>
        {webView}
        {otherView}
      </View>
    );
  }

  goForward = () => {
    UIManager.dispatchViewManagerCommand(
      this.getWebViewBridgeHandle(),
      UIManager.RCTWebViewBridge.Commands.goForward,
      null
    );
  }

  goBack = () => {
    UIManager.dispatchViewManagerCommand(
      this.getWebViewBridgeHandle(),
      UIManager.RCTWebViewBridge.Commands.goBack,
      null
    );
  }

  reload = () => {
    UIManager.dispatchViewManagerCommand(
      this.getWebViewBridgeHandle(),
      UIManager.RCTWebViewBridge.Commands.reload,
      null
    );
  }

  /**
   * Stop loading the current page.
   */
  stopLoading = () => {
    UIManager.dispatchViewManagerCommand(
      this.getWebViewBridgeHandle(),
      UIManager.RCTWebViewBridge.Commands.stopLoading,
      null
    );
  };

  resetSource = () => {
    UIManager.dispatchViewManagerCommand(
      this.getWebViewBridgeHandle(),
      UIManager.RCTWebViewBridge.Commands.resetSource,
      null
    );
  }

  sendToBridge = (message: string) => {
    if (this.getWebViewBridgeHandle()) {
      WebViewBridgeManager.sendToBridge(this.getWebViewBridgeHandle(), message);
    }
  }

  /**
   * We return an event with a bunch of fields including:
   *  url, title, loading, canGoBack, canGoForward
   */
  updateNavigationState = (event: Event) => {
    if (this.props.onNavigationStateChange) {
      this.props.onNavigationStateChange(event.nativeEvent);
    }
  }

  getWebViewBridgeHandle = (): any => {
    return ReactNative.findNodeHandle(this.refs[RCT_WEBVIEWBRIDGE_REF]);
  }

  onLoadingStart = (event: Event) => {
    var onLoadStart = this.props.onLoadStart;
    onLoadStart && onLoadStart(event);
    this.updateNavigationState(event);
  }

  onLoadingError = (event: Event) => {
    event.persist(); // persist this event because we need to store it
    var {onError, onLoadEnd} = this.props;
    onError && onError(event);
    onLoadEnd && onLoadEnd(event);
    // console.warn('Encountered an error loading page', event.nativeEvent);

    this.setState({
      lastErrorEvent: event.nativeEvent,
      viewState: WebViewBridgeState.ERROR
    });
  }

  onLoadingFinish = (event: Event) => {
    var {onLoad, onLoadEnd} = this.props;
    onLoad && onLoad(event);
    onLoadEnd && onLoadEnd(event);
    this.setState({
      viewState: WebViewBridgeState.IDLE,
    });
    this.updateNavigationState(event);
  }
  onAlert = ({nativeEvent: {message}}) => {
    Alert.alert(message, '', [
      {
        text: 'OK',
        onPress: () => {
          WebViewBridgeManager.resolveAlert(this.getWebViewBridgeHandle());
        }
      }
    ]);
  }
  onConfirmDialog = ({nativeEvent: {message}}) => {
    Alert.alert(message, '', [
      {
        text: 'Cancel',
        style: 'cancel',
        onPress: () => {
          WebViewBridgeManager.resolveConfirmDialog(this.getWebViewBridgeHandle(), false);
        }
      },
      {
        text: 'OK',
        onPress: () => {
          WebViewBridgeManager.resolveConfirmDialog(this.getWebViewBridgeHandle(), true);
        }
      },
    ]);
  }
}

var RCTWebViewBridge = requireNativeComponent('RCTWebViewBridge', WebViewBridge, {
  nativeOnly: {
    onLoadingStart: true,
    onLoadingError: true,
    onLoadingFinish: true,
    onAlert: true,
    onConfirmDialog: true,
  },
});

var styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BGWASH,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 2,
  },
  errorTextTitle: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 10,
  },
  hidden: {
    height: 0,
    flex: 0, // disable 'flex:1' when hiding a View
  },
  loadingView: {
    backgroundColor: BGWASH,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webView: {
    backgroundColor: '#ffffff',
  }
});

module.exports = WebViewBridge;
