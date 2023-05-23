import React, { memo, useCallback } from 'react';
import classNames from 'classnames';
import { Relations } from './Relations';
import css from './NodeDetails.module.css';

const NodeDetails = memo(function NodeDetails({ node, className, onSelect, onHover, onClear }) {
    const closeHandler = useCallback(() => onSelect(undefined), [onSelect]);

    return (
        <section className={classNames(css.root, className)}>
            <header className={css.header}>
                <h3 className={css.title}>{node.id}</h3>
                <button className={css.close} onClick={closeHandler}>&#10005;</button>
            </header>
            <Relations {...{ onSelect, onHover, onClear }} title="Parents" items={node.parents} />
            <Relations {...{ onSelect, onHover, onClear }} title="Children" items={node.children} />
            <Relations {...{ onSelect, onHover, onClear }} title="Siblings" items={node.siblings} />
            <Relations {...{ onSelect, onHover, onClear }} title="Spouses" items={node.spouses} />
        </section>
    );
});

export { NodeDetails };
