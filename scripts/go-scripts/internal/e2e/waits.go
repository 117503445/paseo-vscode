package e2e

import (
	"fmt"
	"strings"
	"time"

	"github.com/playwright-community/playwright-go"
)

// selectOptionWhenAvailable 等待目标 option 可用并选择。
// locator 是 select 元素。
// value 是目标 option value。
// timeout 是等待超时时间。
func selectOptionWhenAvailable(locator playwright.Locator, value string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	var lastError error
	for time.Now().Before(deadline) {
		selected, err := locator.SelectOption(
			playwright.SelectOptionValues{Values: &[]string{value}},
			playwright.LocatorSelectOptionOptions{Timeout: playwright.Float(1_000)},
		)
		if err == nil && len(selected) > 0 {
			return nil
		}
		lastError = err
		time.Sleep(500 * time.Millisecond)
	}
	if lastError != nil {
		return fmt.Errorf("选择 option %q 超时：%w", value, lastError)
	}
	return fmt.Errorf("选择 option %q 超时", value)
}

// waitLocatorEnabled 等待元素变为可用状态。
// locator 是目标元素。
// timeout 是等待超时时间。
func waitLocatorEnabled(locator playwright.Locator, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		enabled, err := locator.IsEnabled()
		if err == nil && enabled {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("等待元素可用超时")
}

// waitLocatorCountAtLeast 等待元素数量达到下限。
// locator 是待计数元素。
// minimum 是期望最小数量。
// timeout 是等待超时时间。
func waitLocatorCountAtLeast(locator playwright.Locator, minimum int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	lastCount := 0
	for time.Now().Before(deadline) {
		count, err := locator.Count()
		if err == nil {
			lastCount = count
		}
		if err == nil && count >= minimum {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("等待元素数量达到 %d 超时，最后数量：%d", minimum, lastCount)
}

// expectSelectValue 等待 select 元素选中指定值。
// locator 是 select 元素。
// expected 是期望选中值。
// timeout 是等待超时。
func expectSelectValue(locator playwright.Locator, expected string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	lastValue := ""
	lastOptions := ""
	for time.Now().Before(deadline) {
		value, err := locator.InputValue()
		if err == nil {
			lastValue = value
		}
		options, optionsErr := locator.Evaluate(`element => Array.from(element.options).map(option => option.value + ":" + option.textContent).join(", ")`, nil)
		if optionsErr == nil {
			if optionsText, ok := options.(string); ok {
				lastOptions = optionsText
			}
		}
		if err == nil && value == expected {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("等待 select 值 %q 超时，最后值：%q，可选项：%s", expected, lastValue, lastOptions)
}

// selectSyntheticOption 注入并选择一个测试用 option。
// locator 是 select 元素。
// value 是 option 值。
// label 是 option 展示文案。
func selectSyntheticOption(locator playwright.Locator, value string, label string) error {
	_, err := locator.Evaluate(`(element, option) => {
		const existing = Array.from(element.options).find(entry => entry.value === option.value);
		if (!existing) {
			element.append(new Option(option.label, option.value));
		}
		element.value = option.value;
		element.dispatchEvent(new Event("change", { bubbles: true }));
	}`, map[string]interface{}{"value": value, "label": label})
	return err
}

// expectInputValue 等待输入元素值等于指定文本。
// locator 是 input 或 textarea 元素。
// expected 是期望值。
// timeout 是等待超时。
func expectInputValue(locator playwright.Locator, expected string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	lastValue := ""
	for time.Now().Before(deadline) {
		value, err := locator.InputValue()
		if err == nil {
			lastValue = value
		}
		if err == nil && value == expected {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("等待输入值 %q 超时，最后值：%q", expected, lastValue)
}

// expectText 等待元素包含指定文本。
// locator 是目标元素。
// expected 是期望文本。
// timeout 是等待超时。
func expectText(locator playwright.Locator, expected string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	lastText := ""
	for time.Now().Before(deadline) {
		text, err := locator.TextContent()
		if err == nil {
			lastText = text
		}
		if err == nil && strings.Contains(text, expected) {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("等待文本 %q 超时，最后文本：%q", expected, lastText)
}
