import React from 'react';
import { localized, DraftEditingSession, MessageWithEditorState } from 'mailspring-exports';
import {
  convertFromHTML,
  convertToPlainText,
} from '../../../src/components/composer-editor/conversion';

interface PlaintextToggleButtonProps {
  draft: MessageWithEditorState;
  session: DraftEditingSession;
}

interface PlaintextToggleButtonState {
  converting: boolean;
}

export default class PlaintextToggleButton extends React.Component<
  PlaintextToggleButtonProps,
  PlaintextToggleButtonState
> {
  static displayName = 'PlaintextToggleButton';
  _isConverting = false;

  constructor(props) {
    super(props);
    this.state = {
      converting: false,
    };
  }

  _toggleMode = () => {
    const { draft, session } = this.props;

    if (this._isConverting) {
      return;
    }

    const isCurrentlyPlaintext = draft.plaintext;

    if (!isCurrentlyPlaintext) {
      // Warn user that formatting will be lost
      const confirmed = AppEnv.showConfirmDialog({
        title: localized('Switch to Plain Text?'),
        message: localized(
          'Switching to plain text will remove all formatting, links, and styles. This cannot be undone.'
        ),
        buttons: [localized('Switch to Plain Text'), localized('Keep Rich Text')],
        defaultId: 1,
      });
      if (confirmed !== 0) {
        return;
      }
    }

    this._isConverting = true;
    this.setState({ converting: true });

    try {
      if (isCurrentlyPlaintext) {
        const editorState = convertFromHTML(draft.body);
        session.changes.add({
          plaintext: false,
          bodyEditorState: editorState,
        });
      } else {
        const plaintextBody = convertToPlainText(draft.bodyEditorState);
        session.changes.add({
          plaintext: true,
          body: plaintextBody,
        });
      }
    } catch (error) {
      AppEnv.showErrorDialog(
        localized('Failed to convert message'),
        localized('An error occurred while switching text modes. Please try again.')
      );
      console.error('Plaintext toggle conversion error:', error);
    } finally {
      this._isConverting = false;
      this.setState({ converting: false });
    }
  };

  _onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this._toggleMode();
    }
  };

  render() {
    const { draft } = this.props;
    const { converting } = this.state;
    const isPlaintext = draft.plaintext;
    const label = isPlaintext ? localized('Rich Text') : localized('Plain Text');
    const symbol = isPlaintext ? '✎' : '↯';
    const tooltip = isPlaintext
      ? localized('Switch to Rich Text')
      : localized('Switch to Plain Text');

    return (
      <span
        className={`action toggle-plaintext ${converting ? 'converting' : ''}`}
        role="button"
        tabIndex={-1}
        title={tooltip}
        aria-label={tooltip}
        onClick={this._toggleMode}
        onKeyDown={this._onKeyDown}
      >
        <span aria-hidden="true">{symbol}</span>
        <span>{label}</span>
      </span>
    );
  }
}
