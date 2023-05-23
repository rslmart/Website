import React, { useCallback } from 'react';
import classNames from 'classnames';
import css from './FamilyNode.module.css';

const FamilyNode = React.memo(function FamilyNode({
                                                      node,
                                                      isRoot,
                                                      isHover,
                                                      onClick,
                                                      onSubClick,
                                                      style
                                                  }) {
    const clickHandler = useCallback(() => onClick(node.id), [node.id, onClick]);
    const clickSubHandler = useCallback(() => onSubClick(node.id), [node.id, onSubClick]);

    return (
        <div className={css.root} style={style}>
            <div
                className={classNames(
                    css.inner,
                    css[node.gender],
                    isRoot && css.isRoot,
                    isHover && css.isHover
                )}
                onClick={clickHandler}
            >
                <div className={css.id}>{node.id}</div>
            </div>
            {node.hasSubTree && (
                <div
                    className={classNames(css.sub, css[node.gender])}
                    onClick={clickSubHandler}
                />
            )}
        </div>
    );
});

export { FamilyNode };