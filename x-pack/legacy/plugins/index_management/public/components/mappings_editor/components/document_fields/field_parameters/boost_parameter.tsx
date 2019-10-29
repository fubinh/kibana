/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import React from 'react';

import { EuiRange } from '@elastic/eui';

import { EditFieldFormRow } from '../fields/edit_field';
import { getFieldConfig } from '../../../lib';
import { UseField } from '../../../shared_imports';

interface Props {
  defaultToggleValue: boolean;
}

export const BoostParameter = ({ defaultToggleValue }: Props) => (
  <EditFieldFormRow
    title={<h3>Set boost level</h3>}
    description="This is description text."
    toggleDefaultValue={defaultToggleValue}
  >
    {/* Boost level */}
    <UseField path="boost" config={getFieldConfig('boost')}>
      {boostField => (
        <EuiRange
          min={1}
          max={20}
          value={boostField.value as string}
          onChange={boostField.onChange as any}
          showInput
        />
      )}
    </UseField>
  </EditFieldFormRow>
);
