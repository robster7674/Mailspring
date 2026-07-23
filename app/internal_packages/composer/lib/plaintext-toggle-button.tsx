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

  constructor(props) {
    super(props);
    this.state = {
      converting: false,
    };
  }

  _toggleMode = () => {
    const { draft, session } = this.props;
    const { converting } = this.state;

    if (converting) {
      return;
    }

    this.setState({ converting: true });

    try {
      const isCurrentlyPlaintext = draft.plaintext;

      if (isCurrentlyPlaintext) {
        // Converting from plaintext to rich text
        const editorState = convertFromHTML(draft.body);
        session.changes.add({
          plaintext: false,
          bodyEditorState: editorState,
        });
      } else {
        // Converting from rich text to plaintext
        const plaintextBody = convertToPlainText(draft.bodyEditorState);
        session.changes.add({
          plaintext: true,
          body: plaintextBody,
        });
      }
    } finally {
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
        className="action toggle-plaintext"
        role="button"
        tabIndex={-1}
        title={tooltip}
        aria-label={tooltip}
        onClick={this._toggleMode}
        onKeyDown={this._onKeyDown}
        style={{ opacity: converting ? 0.5 : 1, cursor: 'pointer' }}
      >
        <span style={{ marginRight: '4px', fontSize: '16px' }} aria-hidden="true">
          {symbol}
        </span>
        <span>{label}</span>
      </span>
    );
  }
}
